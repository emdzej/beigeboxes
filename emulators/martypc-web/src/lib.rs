// martypc-web: a wasm-bindgen wrapper around MartyPC's emulator core.
//
// Copyright (C) 2026 Michał Jaskólski
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This program is free software: you can redistribute it and/or modify it under the terms of
// the GNU General Public License as published by the Free Software Foundation, either version 3
// of the License, or (at your option) any later version. See LICENSE in the beigeboxes repo.
//
// MartyPC (https://github.com/dbalsom/martypc) is Copyright 2022-2026 Daniel Balsom, MIT licence.
// The MDA/CGA palette values and the direct-mode drawing loops below follow
// marty_videocard_renderer's draw_mda_direct_u32 / draw_cga_direct_u32 (MIT).

//! One [`XtMachine`] is one IBM 5160 (PC/XT): an 8088 at 4.77 MHz, 8259/8253/8237/8255,
//! NEC µPD765 floppy controller, Model F keyboard, PC speaker, and one MDA, Hercules or CGA
//! card. The page drives it: call `run(ms)` from requestAnimationFrame, blit `frame()`,
//! queue `audio()` into an AudioWorklet, forward key events by `KeyboardEvent.code`.
//!
//! Everything here is single-threaded and synchronous; no SharedArrayBuffer, no atomics.

mod disk;
mod render;

use std::{
    io::Cursor,
    path::{Path, PathBuf},
    str::FromStr,
};

use fluxfox::{DiskImage, DiskImageFileFormat, ImageFormatParser, ImageWriter, ParserWriteCompatibility};
use js_sys::{Reflect, Uint8Array};
use marty_common::types::joystick::ControllerLayout;
use marty_core::{
    coreconfig::CoreConfig,
    cpu_common::TraceMode,
    cpu_validator::ValidatorType,
    device_traits::videocard::{VideoCardSubType, VideoType},
    device_types::{fdc::ImageInsertionPolicy, keyboard::KeyboardType},
    devices::keyboard_common::KeyboardModifiers,
    keys::MartyKey,
    machine::{ExecutionControl, ExecutionState, Machine, MachineBuilder, MachineRomEntry, MachineRomManifest},
    machine_config::{
        ConventionalMemoryConfig,
        FloppyControllerConfig,
        FloppyDriveConfig,
        HardDriveControllerConfig,
        KeyboardConfig,
        MachineConfiguration,
        MemoryConfig,
        VideoCardConfig,
    },
    machine_preferences::MachinePreferences,
    machine_types::{FdcType, FloppyDriveType, HardDiskControllerType, MachineType, OnHaltBehavior},
    sound::SoundOutputConfig,
    vhd::VirtualHardDisk,
};
use wasm_bindgen::prelude::*;

use crate::{
    disk::SharedDisk,
    render::{Phosphor, Renderer},
};

/// Longest slice of emulated time a single `run()` call will execute.
const MAX_RUN_MS: f64 = 100.0;
/// MartyPC's frontend steps the core at 60 Hz; we slice `run()` the same way. The core
/// delivers at most one queued keyboard event per `Machine::run` call, so while keys are
/// pending we use much shorter slices so typing isn't throttled to 60 scancodes/s.
const SLICE_MS: f64 = 1000.0 / 60.0;
const KEY_SLICE_MS: f64 = 2.0;
/// The PIT speaker source runs at 1.193182 MHz / 25.
const SPEAKER_RATE: f64 = 1_193_182.0 / 25.0;
/// Don't let unread audio grow without bound if the page never calls `audio()`.
const MAX_AUDIO_SECONDS: usize = 1;
/// Where the XT-IDE option ROM (XTIDE Universal BIOS) is mapped.
const XTIDE_ROM_ADDR: u32 = 0xC8000;
/// hdd_active() stays true this long (emulated time) after the last sector transfer.
const HDD_LED_US: f64 = 120_000.0;

// --------------------------------------------------------------------------------------------
// Logging to the browser console
// --------------------------------------------------------------------------------------------

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console, js_name = log)]
    fn console_log(s: &str);
    #[wasm_bindgen(js_namespace = console, js_name = warn)]
    fn console_warn(s: &str);
    #[wasm_bindgen(js_namespace = console, js_name = error)]
    fn console_error(s: &str);
}

struct ConsoleLogger;

impl log::Log for ConsoleLogger {
    fn enabled(&self, metadata: &log::Metadata) -> bool {
        metadata.level() <= log::max_level()
    }
    fn log(&self, record: &log::Record) {
        if !self.enabled(record.metadata()) {
            return;
        }
        let msg = format!("[martypc {}] {}", record.target(), record.args());
        match record.level() {
            log::Level::Error => console_error(&msg),
            log::Level::Warn => console_warn(&msg),
            _ => console_log(&msg),
        }
    }
    fn flush(&self) {}
}

static LOGGER: ConsoleLogger = ConsoleLogger;

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
    let _ = log::set_logger(&LOGGER);
    log::set_max_level(log::LevelFilter::Warn);
}

/// Set the core's console log level: "off", "error", "warn" (default), "info", "debug", "trace".
#[wasm_bindgen]
pub fn set_log_level(level: &str) {
    log::set_max_level(log::LevelFilter::from_str(level).unwrap_or(log::LevelFilter::Warn));
}

// --------------------------------------------------------------------------------------------
// CoreConfig: the handful of global options the core asks its frontend for
// --------------------------------------------------------------------------------------------

struct WebCoreConfig;

impl CoreConfig for WebCoreConfig {
    fn get_base_dir(&self) -> PathBuf {
        PathBuf::new()
    }
    fn get_machine_type(&self) -> MachineType {
        MachineType::Ibm5160
    }
    fn get_audio_enabled(&self) -> bool {
        true
    }
    fn get_machine_noroms(&self) -> bool {
        false
    }
    fn get_machine_turbo(&self) -> bool {
        false
    }
    fn get_service_interrupt(&self) -> Option<u8> {
        None
    }
    fn get_keyboard_layout(&self) -> Option<String> {
        None
    }
    fn get_keyboard_debug(&self) -> bool {
        false
    }
    fn get_validator_type(&self) -> Option<ValidatorType> {
        None
    }
    fn get_validator_trace_file(&self) -> Option<PathBuf> {
        None
    }
    fn get_validator_baud(&self) -> Option<u32> {
        None
    }
    fn get_validator_port(&self) -> Option<String> {
        None
    }
    fn get_cpu_trace_mode(&self) -> Option<TraceMode> {
        None
    }
    fn get_cpu_dram_refresh_simulation(&self) -> bool {
        true
    }
    fn get_cpu_trace_on(&self) -> bool {
        false
    }
    fn get_cpu_trace_file(&self) -> Option<PathBuf> {
        None
    }
    fn get_title_hacks(&self) -> bool {
        false
    }
    fn get_patch_enabled(&self) -> bool {
        false
    }
    fn get_halt_behavior(&self) -> OnHaltBehavior {
        OnHaltBehavior::Continue
    }
    fn get_terminal_port(&self) -> Option<u16> {
        None
    }
    fn get_controller_layout(&self) -> Option<ControllerLayout> {
        None
    }
}

// --------------------------------------------------------------------------------------------
// Config object from JS
// --------------------------------------------------------------------------------------------

fn get(obj: &JsValue, key: &str) -> Option<JsValue> {
    Reflect::get(obj, &JsValue::from_str(key))
        .ok()
        .filter(|v| !v.is_undefined() && !v.is_null())
}

fn get_f64(obj: &JsValue, key: &str) -> Result<Option<f64>, JsError> {
    match get(obj, key) {
        None => Ok(None),
        Some(v) => v
            .as_f64()
            .map(Some)
            .ok_or_else(|| JsError::new(&format!("config.{key} must be a number"))),
    }
}

fn get_str(obj: &JsValue, key: &str) -> Result<Option<String>, JsError> {
    match get(obj, key) {
        None => Ok(None),
        Some(v) => v
            .as_string()
            .map(Some)
            .ok_or_else(|| JsError::new(&format!("config.{key} must be a string"))),
    }
}

fn floppy_type(s: &str) -> Result<FloppyDriveType, JsError> {
    Ok(match s.to_ascii_lowercase().as_str() {
        "360k" => FloppyDriveType::Floppy360K,
        "720k" => FloppyDriveType::Floppy720K,
        "1.2m" | "1200k" => FloppyDriveType::Floppy12M,
        "1.44m" | "1440k" => FloppyDriveType::Floppy144M,
        _ => return Err(JsError::new("config.floppy_type must be \"360k\", \"720k\", \"1.2m\" or \"1.44m\"")),
    })
}

// --------------------------------------------------------------------------------------------
// PC speaker: 47.7 kHz mono from the core, box-filtered down to the page's rate, DC removed
// --------------------------------------------------------------------------------------------

struct Resampler {
    step: f64, // input samples per output sample
    pos: f64,
    acc: f32,
    n: u32,
    dc_x: f32,
    dc_y: f32,
    out: Vec<f32>,
    max: usize,
}

impl Resampler {
    fn new(out_rate: f64) -> Self {
        Self {
            step: SPEAKER_RATE / out_rate,
            pos: 0.0,
            acc: 0.0,
            n: 0,
            dc_x: 0.0,
            dc_y: 0.0,
            out: Vec::new(),
            max: (out_rate as usize) * MAX_AUDIO_SECONDS,
        }
    }

    fn push(&mut self, s: f32) {
        self.acc += s;
        self.n += 1;
        self.pos += 1.0;
        if self.pos >= self.step {
            self.pos -= self.step;
            let x = self.acc / self.n as f32;
            self.acc = 0.0;
            self.n = 0;
            // One-pole DC blocker: the core emits 0..1 (speaker cone in/out).
            let y = x - self.dc_x + 0.995 * self.dc_y;
            self.dc_x = x;
            self.dc_y = y;
            if self.out.len() >= self.max {
                let drop = self.out.len() / 2;
                self.out.drain(..drop);
            }
            self.out.push(y * 0.5);
        }
    }
}

// --------------------------------------------------------------------------------------------
// The machine
// --------------------------------------------------------------------------------------------

#[wasm_bindgen(typescript_custom_section)]
const XT_CONFIG_TS: &'static str = r#"
export interface XtConfig {
  /** Conventional memory in KB, 64..640 (default 640). */
  memory_kb?: number;
  /** Display adapter (default "cga"). */
  video?: "mda" | "hercules" | "cga";
  /** System BIOS image, mapped to end at 0xFFFFF. */
  bios: Uint8Array;
  /** Rate for audio(), e.g. AudioContext.sampleRate (default 48000). */
  sample_rate?: number;
  /** 0..4 (default 2). */
  floppy_drives?: number;
  /** Drive type for all drives (default "720k"). */
  floppy_type?: "360k" | "720k" | "1.2m" | "1.44m";
  /** MDA/Hercules monitor colour (default "green"). */
  phosphor?: "green" | "amber" | "white";
  /** XTIDE Universal BIOS for an XT-IDE rev 2 at 0x300; adds the controller (see attach_hdd). */
  xtide_bios?: Uint8Array;
}
"#;

/// An IBM PC/XT (5160) driven from JavaScript.
#[wasm_bindgen]
pub struct XtMachine {
    machine: Machine,
    exec: ExecutionControl,
    renderer: Renderer,
    resampler: Resampler,
    speaker: Option<crossbeam_channel::Receiver<f32>>,
    cycle_debt: f64,
    pending_keys: usize,
    mods: KeyboardModifiers,
    floppy_names: Vec<Option<String>>,
    emulated_us: f64,
    hdd: Option<SharedDisk>,
    hdd_seen: u64,
    hdd_led_until: f64,
}

#[wasm_bindgen]
impl XtMachine {
    /// `config`: `{ memory_kb: 64..640, video: "mda" | "hercules" | "cga", bios: Uint8Array,
    /// sample_rate: number, floppy_drives?: 0..4 (default 2), floppy_type?: "360k" | "720k" |
    /// "1.2m" | "1.44m" (default "720k"), phosphor?: "green" | "amber" | "white" (MDA/Hercules,
    /// default "green"), xtide_bios?: Uint8Array }`.
    ///
    /// The BIOS image is mapped so that it ends at 0xFFFFF (8K GLaBIOS lands at 0xFE000).
    /// With `xtide_bios` (an XTIDE Universal BIOS image configured for an XT-IDE rev 2 at
    /// 0x300, such as roms/ide_xtl.bin) the machine also gets MartyPC's XT-IDE controller,
    /// with that ROM at 0xC8000; see `attach_hdd`.
    #[wasm_bindgen(constructor)]
    pub fn new(#[wasm_bindgen(unchecked_param_type = "XtConfig")] config: JsValue) -> Result<XtMachine, JsError> {
        if !config.is_object() {
            return Err(JsError::new("XtMachine: config must be an object"));
        }

        let memory_kb = get_f64(&config, "memory_kb")?.unwrap_or(640.0) as u32;
        if !(64..=640).contains(&memory_kb) {
            return Err(JsError::new("config.memory_kb must be between 64 and 640"));
        }
        let sample_rate = get_f64(&config, "sample_rate")?.unwrap_or(48000.0);
        if !(8000.0..=192000.0).contains(&sample_rate) {
            return Err(JsError::new("config.sample_rate must be between 8000 and 192000"));
        }
        let drives = get_f64(&config, "floppy_drives")?.unwrap_or(2.0) as usize;
        if drives > 4 {
            return Err(JsError::new("config.floppy_drives must be 0..4"));
        }
        let fd_type = floppy_type(&get_str(&config, "floppy_type")?.unwrap_or_else(|| "720k".into()))?;

        let video = get_str(&config, "video")?.unwrap_or_else(|| "cga".into()).to_ascii_lowercase();
        let (video_type, video_subtype) = match video.as_str() {
            "mda" => (VideoType::MDA, None),
            "hercules" | "hgc" => (VideoType::MDA, Some(VideoCardSubType::Hercules)),
            "cga" => (VideoType::CGA, None),
            _ => return Err(JsError::new("config.video must be \"mda\", \"hercules\" or \"cga\"")),
        };
        let phosphor = match get_str(&config, "phosphor")?.as_deref() {
            None | Some("green") => Phosphor::Green,
            Some("amber") => Phosphor::Amber,
            Some("white") => Phosphor::White,
            Some(_) => return Err(JsError::new("config.phosphor must be \"green\", \"amber\" or \"white\"")),
        };

        let bios = get(&config, "bios")
            .ok_or_else(|| JsError::new("config.bios (Uint8Array) is required"))?
            .dyn_into::<Uint8Array>()
            .map_err(|_| JsError::new("config.bios must be a Uint8Array"))?
            .to_vec();
        if bios.is_empty() || bios.len() > 0x10000 || bios.len() % 2048 != 0 {
            return Err(JsError::new("config.bios must be 2K..64K, a multiple of 2K"));
        }

        let xtide_bios = match get(&config, "xtide_bios") {
            None => None,
            Some(v) => Some(
                v.dyn_into::<Uint8Array>()
                    .map_err(|_| JsError::new("config.xtide_bios must be a Uint8Array"))?
                    .to_vec(),
            ),
        };
        if let Some(rom) = &xtide_bios {
            if rom.is_empty() || rom.len() > 0x8000 || rom.len() % 512 != 0 {
                return Err(JsError::new("config.xtide_bios must be 512 bytes..32K, a multiple of 512"));
            }
        }

        // A ROM manifest built by hand, in place of MartyPC's ROM-set resolver: the system
        // BIOS ending at the top of the 1 MB address space where the 8088 reset vector lives,
        // plus the optional XT-IDE option ROM.
        let mut roms = vec![MachineRomEntry {
            name: "bios".into(),
            path: PathBuf::from("bios.rom"),
            md5: String::new(),
            addr: 0x10_0000 - bios.len() as u32,
            repeat: 1,
            data: bios,
        }];
        if let Some(rom) = xtide_bios.clone() {
            roms.push(MachineRomEntry {
                name: "xtide".into(),
                path: PathBuf::from("xtide.rom"),
                md5: String::new(),
                addr: XTIDE_ROM_ADDR,
                repeat: 1,
                data: rom,
            });
        }
        let manifest = MachineRomManifest {
            roms,
            ..Default::default()
        };

        let machine_config = MachineConfiguration {
            speaker: true,
            machine_type: MachineType::Ibm5160,
            memory: MemoryConfig {
                conventional: ConventionalMemoryConfig {
                    size: memory_kb * 1024,
                    wait_states: 0,
                },
            },
            keyboard: Some(KeyboardConfig {
                kb_type: KeyboardType::ModelF,
                layout: "US".into(),
                typematic: true,
                typematic_delay: None,
                typematic_rate: None,
            }),
            video: vec![VideoCardConfig {
                video_type,
                video_subtype,
                dip_switch: None,
                monitor_emulation: true,
            }],
            fdc: (drives > 0).then(|| FloppyControllerConfig {
                fdc_type: FdcType::IbmNec,
                drive: (0..drives)
                    .map(|_| FloppyDriveConfig {
                        fd_type,
                        image: None,
                    })
                    .collect(),
            }),
            hdc: xtide_bios.as_ref().map(|_| HardDriveControllerConfig {
                hdc_type: HardDiskControllerType::XtIde,
                drive: None,
            }),
            ..Default::default()
        };

        // Lenient: a 360K image in a 720K drive is fine (the emulated head doesn't care about
        // track pitch), which is what you'd want when people drop arbitrary images in.
        let preferences = MachinePreferences {
            image_insertion_policy: ImageInsertionPolicy::Lenient,
        };

        let core_config = WebCoreConfig;
        let machine = MachineBuilder::new()
            .with_core_config(Box::new(&core_config))
            .with_machine_config(&machine_config)
            .with_machine_preferences(&preferences)
            .with_roms(manifest)
            .with_sound_config(SoundOutputConfig {
                enabled: true,
                sample_rate: sample_rate as u32,
                channels: 1,
                buffer_size: 1024,
            })
            .build()
            .map_err(|e| JsError::new(&format!("MartyPC machine build failed: {e}")))?;

        // The PC speaker is always the core's first sound source when `speaker` is set.
        let speaker = machine
            .get_sound_sources()
            .iter()
            .find(|s| s.name == "PC Speaker")
            .map(|s| s.receiver.clone());

        let mut exec = ExecutionControl::new();
        exec.set_state(ExecutionState::Running);

        Ok(XtMachine {
            machine,
            exec,
            renderer: Renderer::new(video_type, phosphor),
            resampler: Resampler::new(sample_rate),
            speaker,
            cycle_debt: 0.0,
            pending_keys: 0,
            mods: KeyboardModifiers::default(),
            floppy_names: vec![None; drives],
            emulated_us: 0.0,
            hdd: None,
            hdd_seen: 0,
            hdd_led_until: 0.0,
        })
    }

    /// Run `ms` milliseconds of emulated time (capped at 100 ms per call). Call it with the
    /// wall-clock time since the last frame to run in real time.
    pub fn run(&mut self, ms: f64) {
        if !(ms > 0.0) {
            return;
        }
        let mut left = ms.min(MAX_RUN_MS);
        let mhz = self.machine.get_cpu_mhz();
        while left > 0.0 {
            let slice = left.min(if self.pending_keys > 0 { KEY_SLICE_MS } else { SLICE_MS });
            left -= slice;
            self.cycle_debt += slice * 1000.0 * mhz;
            if self.cycle_debt >= 1.0 {
                let before = self.machine.cpu_cycles();
                self.machine.run(self.cycle_debt as u32, &mut self.exec);
                let ran = self.machine.cpu_cycles().wrapping_sub(before) as f64;
                // The core finishes the instruction in flight, so it overshoots slightly;
                // carry that into the next slice.
                self.cycle_debt -= ran;
                self.emulated_us += ran / mhz;
                self.pending_keys = self.pending_keys.saturating_sub(1);
            }
            if let Some(d) = &self.hdd {
                let n = d.accesses();
                if n != self.hdd_seen {
                    self.hdd_seen = n;
                    self.hdd_led_until = self.emulated_us + HDD_LED_US;
                }
            }
            self.machine.frame_update();
            // Drain machine events (resets, halts); nothing here needs them yet.
            while self.machine.get_event().is_some() {}
            self.drain_audio();
        }
        // Presentable events (drive motor/seek/media sounds) are for the page to synthesise
        // from floppy_active(); drop them so the channel doesn't grow.
        for _ in self.machine.presentable_event_receiver().try_iter() {}
    }

    fn drain_audio(&mut self) {
        if let Some(rx) = &self.speaker {
            for s in rx.try_iter() {
                self.resampler.push(s);
            }
        }
    }

    /// The current frame as RGBA bytes (`frame_width() * frame_height() * 4`).
    /// MDA/Hercules: 720x350, phosphor-tinted. CGA: 640x200 line-doubled to 640x400 (text and
    /// graphics), RGBI colours. Sizes can change with the video mode; read them per frame.
    pub fn frame(&mut self) -> Vec<u8> {
        if let Some(card) = self.machine.primary_videocard() {
            self.renderer.draw(*card);
        }
        self.renderer.rgba().to_vec()
    }

    pub fn frame_width(&self) -> u32 {
        self.renderer.width()
    }

    pub fn frame_height(&self) -> u32 {
        self.renderer.height()
    }

    /// PC-speaker audio produced since the last call: mono f32 at `sample_rate`.
    pub fn audio(&mut self) -> Vec<f32> {
        std::mem::take(&mut self.resampler.out)
    }

    /// Press a key by `KeyboardEvent.code` ("KeyA", "Enter", "ShiftLeft", "F1", "Numpad7"...).
    /// Returns false if the code has no PC/XT equivalent.
    pub fn key_down(&mut self, code: &str) -> bool {
        let Ok(key) = MartyKey::from_str(code)
        else {
            return false;
        };
        self.set_mod(key, true);
        self.machine.key_press(key, self.mods);
        self.pending_keys += 1;
        true
    }

    pub fn key_up(&mut self, code: &str) -> bool {
        let Ok(key) = MartyKey::from_str(code)
        else {
            return false;
        };
        self.set_mod(key, false);
        self.machine.key_release(key);
        self.pending_keys += 1;
        true
    }

    fn set_mod(&mut self, key: MartyKey, down: bool) {
        match key {
            MartyKey::ControlLeft | MartyKey::ControlRight => self.mods.control = down,
            MartyKey::AltLeft | MartyKey::AltRight => self.mods.alt = down,
            MartyKey::ShiftLeft | MartyKey::ShiftRight => self.mods.shift = down,
            MartyKey::MetaLeft | MartyKey::MetaRight => self.mods.meta = down,
            _ => {}
        }
    }

    /// Send Ctrl+Alt+Del (a warm boot, handled by the BIOS).
    pub fn ctrl_alt_del(&mut self) {
        self.machine.emit_ctrl_alt_del();
        self.pending_keys += 6;
    }

    /// Hard reset: like the power switch, RAM is cleared. Inserted floppies stay in.
    pub fn reset(&mut self) {
        self.machine.reset();
        self.mods = KeyboardModifiers::default();
        self.cycle_debt = 0.0;
    }

    /// Insert a floppy image (raw .img/.ima of 160K..1.44M, or anything fluxfox reads: IMD,
    /// PSI, 86F, HFE, MFM, TC, PRI, MFI, Kryoflux, SCP, zip/gz...). `name` is used for format
    /// detection by extension, as a hint. Throws if unreadable or the drive can't take it.
    pub fn insert_floppy(&mut self, drive: usize, bytes: &[u8], name: &str) -> Result<(), JsError> {
        let fdc = self
            .machine
            .fdc()
            .as_mut()
            .ok_or_else(|| JsError::new("this machine has no floppy controller"))?;
        if drive >= fdc.drive_ct() {
            return Err(JsError::new(&format!("no floppy drive {drive}")));
        }
        let path = Path::new(name);
        let mut cursor = Cursor::new(bytes.to_vec());
        let image = DiskImage::load(&mut cursor, Some(path), None, None)
            .map_err(|e| JsError::new(&format!("couldn't read floppy image '{name}': {e}")))?;
        fdc.attach_image(drive, image, Some(path.to_path_buf()), false)
            .map_err(|e| JsError::new(&format!("drive {drive} won't take '{name}': {e}")))?;
        self.floppy_names[drive] = Some(name.to_string());
        Ok(())
    }

    /// Eject the floppy in `drive`, returning its current bytes, guest writes included (in its
    /// original format when fluxfox can write that losslessly, otherwise as a raw sector
    /// image), or `null` if the drive was empty.
    pub fn eject_floppy(&mut self, drive: usize) -> Result<Option<Vec<u8>>, JsError> {
        let Some(fdc) = self.machine.fdc().as_mut()
        else {
            return Ok(None);
        };
        if drive >= fdc.drive_ct() {
            return Ok(None);
        }
        let (image, _) = fdc.get_image(drive);
        let bytes = match image {
            None => None,
            Some(lock) => {
                let mut img = lock
                    .write()
                    .map_err(|_| JsError::new("floppy image lock poisoned"))?;
                Some(export_image(&mut img)?)
            }
        };
        fdc.unload_image(drive);
        if let Some(n) = self.floppy_names.get_mut(drive) {
            *n = None;
        }
        Ok(bytes)
    }

    /// True while that drive's motor is spinning (BIOS turns it off ~2 s after the last access).
    pub fn floppy_active(&mut self, drive: usize) -> bool {
        match self.machine.fdc().as_ref() {
            Some(fdc) if drive < fdc.drive_ct() => fdc.drive(drive).is_motor_on(),
            _ => false,
        }
    }

    /// Number of floppy drives fitted.
    pub fn floppy_drives(&mut self) -> usize {
        self.machine.fdc().as_ref().map_or(0, |f| f.drive_ct())
    }

    /// Attach a fixed-size VHD (raw sectors + 512-byte "conectix" footer) as the XT-IDE master.
    /// Needs `xtide_bios` in the config. The geometry must be one MartyPC's XT-IDE accepts
    /// (e.g. 615/4/17 = 20 MB, 306/4/17 = 10 MB, 1024/16/63 ...). XUB scans for drives at POST,
    /// so attach before the first run() or call reset() after.
    pub fn attach_hdd(&mut self, bytes: Vec<u8>) -> Result<(), JsError> {
        let disk = SharedDisk::new(bytes);
        let vhd = VirtualHardDisk::parse(Box::new(disk.clone()), false)
            .map_err(|e| JsError::new(&format!("not a fixed VHD: {e}")))?;
        let xtide = self
            .machine
            .xtide_mut()
            .as_mut()
            .ok_or_else(|| JsError::new("no XT-IDE controller (pass xtide_bios in the config)"))?;
        xtide
            .set_vhd(0, vhd)
            .map_err(|e| JsError::new(&format!("XT-IDE rejected the VHD: {e}")))?;
        self.hdd_seen = disk.accesses();
        self.hdd = Some(disk);
        Ok(())
    }

    /// Detach the hard disk, returning its bytes (guest writes included), or null if none.
    pub fn detach_hdd(&mut self) -> Option<Vec<u8>> {
        let disk = self.hdd.take()?;
        if let Some(x) = self.machine.xtide_mut().as_mut() {
            let _ = x.unload_vhd(0);
        }
        Some(disk.bytes())
    }

    /// A copy of the attached hard disk's current bytes without detaching it.
    pub fn hdd_bytes(&self) -> Option<Vec<u8>> {
        self.hdd.as_ref().map(|d| d.bytes())
    }

    /// True for ~120 ms (emulated) after each hard-disk sector transfer: the front-panel LED.
    pub fn hdd_active(&self) -> bool {
        self.hdd.is_some() && self.emulated_us < self.hdd_led_until
    }

    /// Read `len` bytes of the 1 MB address space without side effects (video memory included),
    /// e.g. `peek(0xB8000, 4000)` for an 80x25 CGA text page, 0xB0000 for MDA. For debugging,
    /// tests, or reading the screen as text.
    pub fn peek(&self, addr: u32, len: u32) -> Vec<u8> {
        let bus = self.machine.bus();
        (addr..addr.saturating_add(len).min(0x10_0000))
            .map(|a| bus.peek_u8(a as usize).unwrap_or(0xFF))
            .collect()
    }

    /// Effective CPU clock in MHz (4.77 for an XT).
    pub fn cpu_mhz(&self) -> f64 {
        self.machine.get_cpu_mhz()
    }

    /// Total emulated time since construction, in milliseconds (for measuring speed).
    pub fn emulated_ms(&self) -> f64 {
        self.emulated_us / 1000.0
    }
}

fn export_image(img: &mut DiskImage) -> Result<Vec<u8>, JsError> {
    let source = img.source_format();
    let format = match source {
        Some(f) if matches!(f.can_write(Some(img)), ParserWriteCompatibility::Ok) => f,
        _ => DiskImageFileFormat::RawSectorImage,
    };
    let mut buf = Cursor::new(Vec::new());
    ImageWriter::<Cursor<Vec<u8>>>::new(img)
        .with_format(format)
        .with_writer(&mut buf)
        .write()
        .map_err(|e| JsError::new(&format!("couldn't export floppy image: {e}")))?;
    Ok(buf.into_inner())
}
