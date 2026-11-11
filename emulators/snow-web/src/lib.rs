//! A Macintosh Plus (or 128K/512K) for a web page: Snow's emulator core, driven from JavaScript.
//!
//! Single-threaded: the page calls `run(ms)` from requestAnimationFrame and takes the frame and
//! the sound out afterwards. No threads, no SharedArrayBuffer.

mod gcr;
mod keys;

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use anyhow::Result;
use snow_core::emulator::comm::{EmulatorCommand, EmulatorEvent};
use snow_core::emulator::{Emulator, MouseMode};
use snow_core::keymap::{KeyEvent, Keymap};
use snow_core::mac::MacModel;
use snow_core::mac::scsi::disk_image::DiskImage;
use snow_core::renderer::{AudioBuffer, AudioProvider, AudioSink, DisplayBuffer};
use snow_core::tickable::Tickable;
use snow_floppy::FloppyImage;
use snow_floppy::loaders::{Autodetect, FloppyImageLoader, ImageType};
use wasm_bindgen::prelude::*;

/// The compact Macs' bus clock, C8M: what the CPU's cycle counter counts.
const BUS_HZ: f64 = 7_833_600.0;
/// The sound: one sample a scan line, 370 lines at 60.15 Hz; Snow rounds it to this.
const AUDIO_RATE: u32 = 22050;
/// Most sound kept if the page never takes it: one second.
const AUDIO_MAX: usize = AUDIO_RATE as usize;
const FLOPPY_DRIVES: usize = 2;

#[wasm_bindgen(start)]
fn start() {
    console_error_panic_hook::set_once();
    let _ = log::set_logger(&LOGGER);
    log::set_max_level(log::LevelFilter::Warn);
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console, js_name = warn)]
    fn console_warn(s: &str);
    #[wasm_bindgen(js_namespace = console, js_name = log)]
    fn console_log(s: &str);
}

struct ConsoleLogger;
static LOGGER: ConsoleLogger = ConsoleLogger;

impl log::Log for ConsoleLogger {
    fn enabled(&self, m: &log::Metadata) -> bool {
        m.level() <= log::max_level()
    }
    fn log(&self, r: &log::Record) {
        if !self.enabled(r.metadata()) {
            return;
        }
        let s = format!("snow: {} {}: {}", r.level(), r.target(), r.args());
        if r.level() <= log::Level::Warn {
            console_warn(&s);
        } else {
            console_log(&s);
        }
    }
    fn flush(&self) {}
}

#[wasm_bindgen]
pub fn set_log_level(level: &str) {
    log::set_max_level(match level {
        "off" => log::LevelFilter::Off,
        "error" => log::LevelFilter::Error,
        "info" => log::LevelFilter::Info,
        "debug" => log::LevelFilter::Debug,
        "trace" => log::LevelFilter::Trace,
        _ => log::LevelFilter::Warn,
    });
}

/// What a ROM is to Snow: "plus", "512k", "128k", or "" if Snow doesn't know it.
#[wasm_bindgen]
pub fn rom_model(rom: &[u8]) -> String {
    match MacModel::detect_from_rom(rom) {
        Some(MacModel::Plus) | Some(MacModel::Early512Ke) => "plus".into(),
        Some(MacModel::Early512K) => "512k".into(),
        Some(MacModel::Early128K) => "128k".into(),
        _ => String::new(),
    }
}

// --- sound: Snow pushes 512-sample stereo buffers; we keep the left channel --------------------

#[derive(Clone, Default)]
struct Samples(Arc<Mutex<VecDeque<f32>>>);

impl AudioSink for Samples {
    fn send(&self, buffer: AudioBuffer) -> Result<()> {
        let mut q = self.0.lock().unwrap();
        q.extend(buffer.iter().step_by(2).copied());
        let over = q.len().saturating_sub(AUDIO_MAX);
        q.drain(..over);
        Ok(())
    }
    fn is_full(&self) -> bool {
        false
    }
    fn is_empty(&self) -> bool {
        self.0.lock().unwrap().is_empty()
    }
}

struct Speaker(Samples);

impl AudioProvider for Speaker {
    fn create_stream(&mut self, _freq: i32, _channels: u8, _samples: u16) -> Result<Box<dyn AudioSink>> {
        Ok(Box::new(self.0.clone()))
    }
}

// --- SCSI disks held in memory -----------------------------------------------------------------

#[derive(Default)]
struct DiskState {
    bytes: Vec<u8>,
    dirty: bool,
    /// Bumped on every read or write, for the drive light.
    activity: u32,
}

#[derive(Clone)]
struct MemDisk(Arc<Mutex<DiskState>>);

impl DiskImage for MemDisk {
    fn byte_len(&self) -> usize {
        self.0.lock().unwrap().bytes.len()
    }
    fn read_bytes(&self, offset: usize, length: usize) -> Vec<u8> {
        let mut d = self.0.lock().unwrap();
        d.activity = d.activity.wrapping_add(1);
        d.bytes[offset..offset + length].to_vec()
    }
    fn write_bytes(&mut self, offset: usize, data: &[u8]) {
        let mut d = self.0.lock().unwrap();
        d.activity = d.activity.wrapping_add(1);
        d.dirty = true;
        d.bytes[offset..offset + data.len()].copy_from_slice(data);
    }
    fn media_bytes(&self) -> Option<&[u8]> {
        // Only save states read this.
        None
    }
    fn image_path(&self) -> Option<&std::path::Path> {
        None
    }
}

// --- floppies ----------------------------------------------------------------------------------

/// A disk in a drive: what it was made from, so writes can go back in the same format.
struct Inserted {
    source: Vec<u8>,
    format: ImageType,
}

#[derive(Default)]
struct Drive {
    disk: Option<Inserted>,
    /// The host took the disk out; Snow's eject event for it is not the guest's.
    host_ejecting: bool,
    /// The guest ejected it: Some(bytes if the disk was written to and can be saved).
    guest_ejected: Option<Option<Vec<u8>>>,
    was_inserted: bool,
}

/// The image as a file again, with the guest's writes: None if it wasn't written to, or the
/// format can't be written back.
fn export(img: &FloppyImage, disk: &Inserted) -> Option<Vec<u8>> {
    if !img.is_dirty() {
        return None;
    }
    let out = match disk.format {
        ImageType::Raw => gcr::to_raw(img, &disk.source).map(|(data, _)| data),
        ImageType::DC42 => gcr::to_dc42(img, &disk.source),
        ImageType::MOOF => {
            let mut v = vec![];
            snow_floppy::loaders::save_image(img, &mut v).map(|_| v).map_err(|e| e.to_string())
        }
        other => Err(format!("{} images are read-only here", other.as_friendly_str())),
    };
    match out {
        Ok(v) => Some(v),
        Err(e) => {
            log::warn!("floppy not saved: {e}");
            None
        }
    }
}

#[wasm_bindgen]
pub struct MacMachine {
    emu: Emulator,
    frames: Arc<Mutex<Option<DisplayBuffer>>>,
    frame: Vec<u8>,
    width: u32,
    height: u32,
    fresh: bool,
    samples: Samples,
    /// Emulated time owed, as a cycle count to reach.
    target: f64,
    drives: [Drive; FLOPPY_DRIVES],
    disks: [Option<MemDisk>; 7],
    messages: VecDeque<String>,
    model: MacModel,
    ram: usize,
    run_queued: bool,
    keymap_down: Vec<u8>,
}

#[wasm_bindgen]
impl MacMachine {
    /// `model`: "plus", "512k", "128k", or "" to tell from the ROM (an unknown 128 KB ROM runs
    /// as a Plus). `ram_kb`: 1024, 2048 or 4096 on a Plus; the 128K and 512K have what they have.
    #[wasm_bindgen(constructor)]
    pub fn new(rom: &[u8], model: &str, ram_kb: u32) -> Result<MacMachine, JsError> {
        let model = match model {
            "plus" => MacModel::Plus,
            "512k" => MacModel::Early512K,
            "128k" => MacModel::Early128K,
            _ => match MacModel::detect_from_rom(rom) {
                Some(MacModel::Early128K) => MacModel::Early128K,
                Some(MacModel::Early512K) => MacModel::Early512K,
                Some(MacModel::Plus) | Some(MacModel::Early512Ke) => MacModel::Plus,
                _ if rom.len() == 128 * 1024 => MacModel::Plus,
                _ if rom.len() == 64 * 1024 => MacModel::Early512K,
                _ => return Err(JsError::new("not a Macintosh 128K, 512K or Plus ROM")),
            },
        };
        let want = model.ram_size_options();
        let ram = if model == MacModel::Plus {
            // A real Plus also takes 2.5 MB; Snow's RAM is a power of two, so it gets 2.
            let kb = (ram_kb as usize) * 1024;
            want.iter().copied().filter(|&o| o <= kb).max().unwrap_or(1024 * 1024)
        } else {
            model.ram_size_default()
        };
        let (mut emu, frames) = Emulator::new_with_extra(
            rom,
            &[],
            model,
            None,
            MouseMode::Absolute,
            Some(ram),
            None,
            false,
            false,
            None,
            None,
            None,
        )
        .map_err(|e| JsError::new(&format!("{e:#}")))?;
        let samples = Samples::default();
        let speaker: Arc<Mutex<dyn AudioProvider>> = Arc::new(Mutex::new(Speaker(samples.clone())));
        emu.set_audio_provider(speaker).map_err(|e| JsError::new(&format!("{e:#}")))?;
        let cmd = emu.create_cmd_sender();
        cmd.send(EmulatorCommand::Run).unwrap();
        let target = emu.get_cycles() as f64;
        Ok(MacMachine {
            emu,
            frames,
            frame: vec![],
            width: 512,
            height: 342,
            fresh: false,
            samples,
            target,
            drives: Default::default(),
            disks: Default::default(),
            messages: VecDeque::new(),
            model,
            ram,
            run_queued: true,
            keymap_down: vec![],
        })
    }

    /// Which machine it is: "Macintosh Plus", ...
    pub fn model_name(&self) -> String {
        self.model.to_string()
    }

    /// RAM fitted, in KB.
    pub fn ram_kb(&self) -> u32 {
        (self.ram / 1024) as u32
    }

    /// Run `ms` of emulated time (at most 100 at once).
    pub fn run(&mut self, ms: f64) {
        let ms = ms.clamp(0.0, 100.0);
        self.target += ms * BUS_HZ / 1000.0;
        let now = self.emu.get_cycles() as f64;
        // Far behind (a slow machine, a background tab): let it go rather than race.
        if self.target - now > BUS_HZ * 0.1 {
            self.target = now + BUS_HZ * 0.1;
        }
        // Snow runs 10,000 instructions a tick; the overshoot is paid back next frame.
        let mut guard = 0;
        while (self.emu.get_cycles() as f64) < self.target && guard < 400 {
            // `Run` is still queued until the first tick takes it; stopped, Snow's tick would
            // sleep, which wasm can't.
            if !self.emu.is_running() && !self.run_queued {
                break;
            }
            self.run_queued = false;
            if let Err(e) = self.emu.tick(1, ()) {
                self.messages.push_back(format!("{e:#}"));
                break;
            }
            guard += 1;
        }
        self.after_run();
    }

    fn after_run(&mut self) {
        // A disk the guest ejected: Snow says so in its next status.
        let mut changed = false;
        for (i, d) in self.drives.iter_mut().enumerate() {
            let inserted = self.emu.fdd_state(i).is_some_and(|s| s.0);
            if d.was_inserted && !inserted {
                changed = true;
            }
            d.was_inserted = inserted;
        }
        if changed {
            let _ = self.emu.poll_status();
        }
        let events = self.emu.create_event_recv();
        while let Ok(ev) = events.try_recv() {
            match ev {
                EmulatorEvent::FloppyEjected(i, img) => {
                    let Some(d) = self.drives.get_mut(i) else { continue };
                    let disk = d.disk.take();
                    if d.host_ejecting {
                        d.host_ejecting = false;
                    } else if let Some(disk) = disk {
                        d.guest_ejected = Some(export(&img, &disk));
                    }
                }
                EmulatorEvent::UserMessage(_, msg) => self.messages.push_back(msg),
                _ => {}
            }
        }
        if let Some(buf) = self.frames.lock().unwrap().take() {
            self.width = buf.width() as u32;
            self.height = buf.height() as u32;
            self.frame = buf.into_inner();
            self.fresh = true;
        }
    }

    /// The last frame as RGBA, `frame_width` x `frame_height`. Empty before the first.
    pub fn frame(&mut self) -> Vec<u8> {
        self.fresh = false;
        self.frame.clone()
    }

    /// A new frame since the last `frame()`.
    pub fn frame_ready(&self) -> bool {
        self.fresh
    }

    pub fn frame_width(&self) -> u32 {
        self.width
    }

    pub fn frame_height(&self) -> u32 {
        self.height
    }

    /// The sound since the last call: mono, `audio_rate()` Hz, -1..1.
    pub fn audio(&mut self) -> Vec<f32> {
        self.samples.0.lock().unwrap().drain(..).collect()
    }

    pub fn audio_rate(&self) -> u32 {
        AUDIO_RATE
    }

    /// A key by `KeyboardEvent.code`. False if the Mac has no such key.
    pub fn key_down(&mut self, code: &str) -> bool {
        let Some(sc) = keys::scancode(code) else { return false };
        if !self.keymap_down.contains(&sc) {
            self.keymap_down.push(sc);
        }
        self.send(EmulatorCommand::KeyEvent(KeyEvent::KeyDown(sc, Keymap::Universal)));
        true
    }

    pub fn key_up(&mut self, code: &str) -> bool {
        let Some(sc) = keys::scancode(code) else { return false };
        self.keymap_down.retain(|&k| k != sc);
        self.send(EmulatorCommand::KeyEvent(KeyEvent::KeyUp(sc, Keymap::Universal)));
        true
    }

    /// Let go of every key and the mouse button: the page lost focus.
    pub fn release_all(&mut self) {
        self.keymap_down.clear();
        self.send(EmulatorCommand::ReleaseAllInputs);
    }

    /// The pointer at screen pixel (x, y). Absolute mode only: the Mac's cursor jumps there.
    pub fn mouse_abs(&mut self, x: u16, y: u16) {
        self.send(EmulatorCommand::MouseUpdateAbsolute { x, y });
    }

    /// Mouse movement, in screen pixels. Relative mode only.
    pub fn mouse_rel(&mut self, dx: i16, dy: i16) {
        self.send(EmulatorCommand::MouseUpdateRelative { relx: dx, rely: dy, btn: None });
    }

    pub fn mouse_button(&mut self, down: bool) {
        self.send(EmulatorCommand::MouseUpdateRelative { relx: 0, rely: 0, btn: Some(down) });
    }

    /// "absolute": the cursor follows the pointer, by writing the Mac's own mouse globals
    /// (fine for the system and most applications). "relative": a real mouse's quadrature
    /// signals, for games that read the hardware; wants pointer lock.
    pub fn set_mouse_mode(&mut self, mode: &str) {
        let m = if mode == "relative" { MouseMode::RelativeHw } else { MouseMode::Absolute };
        self.send(EmulatorCommand::SetMouseMode(m));
    }

    /// The Programmer's Switch: interrupt.
    pub fn interrupt(&mut self) {
        self.send(EmulatorCommand::ProgKey);
    }

    /// The reset switch: disks stay in.
    pub fn reset(&mut self) {
        self.send(EmulatorCommand::Reset);
    }

    /// A disk in drive 0 (internal) or 1 (external): raw 400K/800K, DiskCopy 4.2, MOOF and
    /// the other formats Snow reads. `locked`: the write-protect tab is open.
    pub fn insert_floppy(&mut self, drive: usize, bytes: &[u8], name: &str, locked: bool) -> Result<(), JsError> {
        if drive >= FLOPPY_DRIVES || self.emu.fdd_state(drive).is_none() {
            return Err(JsError::new("no such drive"));
        }
        let format = Autodetect::detect(bytes).map_err(|e| JsError::new(&format!("{e:#}")))?;
        let img = Autodetect::load(bytes, Some(name)).map_err(|e| JsError::new(&format!("{e:#}")))?;
        let d = &mut self.drives[drive];
        d.disk = Some(Inserted { source: bytes.to_vec(), format });
        d.guest_ejected = None;
        self.send(EmulatorCommand::InsertFloppyImage(drive, Box::new(img), locked));
        Ok(())
    }

    /// Take a disk out from the host side. Returns its bytes if the guest wrote to it and they
    /// can be saved in the image's format, otherwise undefined.
    pub fn eject_floppy(&mut self, drive: usize) -> Option<Vec<u8>> {
        let bytes = self.floppy_bytes(drive);
        let d = self.drives.get_mut(drive)?;
        if d.disk.is_none() {
            return None;
        }
        // Snow reports every eject; this one is ours.
        d.host_ejecting = self.emu.fdd_state(drive).is_some_and(|s| s.0);
        d.disk = None;
        self.send(EmulatorCommand::EjectFloppy(drive));
        bytes
    }

    /// The disk's bytes now, with the guest's writes; undefined if unchanged or unsaveable.
    pub fn floppy_bytes(&self, drive: usize) -> Option<Vec<u8>> {
        let disk = self.drives.get(drive)?.disk.as_ref()?;
        export(self.emu.fdd_image(drive)?, disk)
    }

    /// Drives the guest ejected a disk from since the last call (the Mac ejects by itself:
    /// Eject in the Finder, dragging a disk to the Trash, shutting down).
    pub fn guest_ejects(&mut self) -> Vec<u32> {
        self.drives
            .iter()
            .enumerate()
            .filter(|(_, d)| d.guest_ejected.is_some())
            .map(|(i, _)| i as u32)
            .collect()
    }

    /// What the guest ejected from `drive`: its bytes if written to, else undefined. Clears it.
    pub fn take_guest_eject(&mut self, drive: usize) -> Option<Vec<u8>> {
        self.drives.get_mut(drive)?.guest_ejected.take().flatten()
    }

    pub fn floppy_inserted(&self, drive: usize) -> bool {
        self.emu.fdd_state(drive).is_some_and(|s| s.0)
    }

    /// The drive motor is on: the light, and the noise.
    pub fn floppy_motor(&self, drive: usize) -> bool {
        self.emu.fdd_state(drive).is_some_and(|s| s.0 && s.1)
    }

    /// A SCSI hard disk at ID 0..6: a whole-disk image with an Apple partition map and driver
    /// (as HD SC Setup writes it, or a BlueSCSI image), a multiple of 512 bytes. Plus only.
    pub fn attach_hdd(&mut self, id: usize, bytes: Vec<u8>) -> Result<(), JsError> {
        if id >= 7 {
            return Err(JsError::new("SCSI ID out of range"));
        }
        if bytes.is_empty() || bytes.len() % 512 != 0 {
            return Err(JsError::new("not a multiple of 512 bytes"));
        }
        if self.model != MacModel::Plus {
            return Err(JsError::new("this Macintosh has no SCSI port"));
        }
        let disk = MemDisk(Arc::new(Mutex::new(DiskState { bytes, ..Default::default() })));
        self.emu
            .attach_disk_image_at(Box::new(disk.clone()), id)
            .map_err(|e| JsError::new(&format!("{e:#}")))?;
        self.disks[id] = Some(disk);
        Ok(())
    }

    /// The disk's bytes if the guest wrote to it since it was attached (or last asked).
    pub fn hdd_bytes(&mut self, id: usize) -> Option<Vec<u8>> {
        let disk = self.disks.get(id)?.as_ref()?;
        let mut d = disk.0.lock().unwrap();
        if !d.dirty {
            return None;
        }
        d.dirty = false;
        Some(d.bytes.clone())
    }

    /// A counter bumped on every SCSI disk access: changed since last frame means busy.
    pub fn hdd_activity(&self) -> u32 {
        self.disks
            .iter()
            .flatten()
            .fold(0u32, |a, d| a.wrapping_add(d.0.lock().unwrap().activity))
    }

    /// Something Snow wants to tell the user, or undefined.
    pub fn take_message(&mut self) -> Option<String> {
        self.messages.pop_front()
    }

    /// Emulated CPU cycles so far.
    pub fn cycles(&self) -> f64 {
        self.emu.get_cycles() as f64
    }

    pub fn running(&self) -> bool {
        self.run_queued || self.emu.is_running()
    }

    fn send(&self, cmd: EmulatorCommand) {
        let _ = self.emu.create_cmd_sender().send(cmd);
    }
}
