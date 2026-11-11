// martypc-web: RGBA conversion of MartyPC's direct-mode video buffers.
//
// Copyright (C) 2026 Michał Jaskólski
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The loops follow marty_videocard_renderer's draw_mda_direct_u32 / draw_cga_direct_u32
// (MartyPC, Copyright 2022-2026 Daniel Balsom, MIT). Using our own small copy instead of that
// crate keeps EGA/VGA (and their fonts), PNG and image-resize code out of the wasm.

use marty_core::device_traits::videocard::{BufferSelect, DisplayApertureType, VideoCard, VideoType};

#[derive(Copy, Clone, Debug, PartialEq)]
pub enum Phosphor {
    Green,
    Amber,
    White,
}

/// CGA RGBI, the conventional palette (as MartyPC's renderer defaults to).
const CGA_RGB: [[u8; 3]; 16] = [
    [0x00, 0x00, 0x00],
    [0x00, 0x00, 0xAA],
    [0x00, 0xAA, 0x00],
    [0x00, 0xAA, 0xAA],
    [0xAA, 0x00, 0x00],
    [0xAA, 0x00, 0xAA],
    [0xAA, 0x55, 0x00],
    [0xAA, 0xAA, 0xAA],
    [0x55, 0x55, 0x55],
    [0x55, 0x55, 0xFF],
    [0x55, 0xFF, 0x55],
    [0x55, 0xFF, 0xFF],
    [0xFF, 0x55, 0x55],
    [0xFF, 0x55, 0xFF],
    [0xFF, 0xFF, 0x55],
    [0xFF, 0xFF, 0xFF],
];

fn rgba(c: [u8; 3]) -> u32 {
    u32::from_le_bytes([c[0], c[1], c[2], 0xFF])
}

/// The MDA buffer holds 2-bit intensities: 0 off, 1 dim, 2 normal, 3 bright.
fn mono_palette(p: Phosphor) -> [u32; 4] {
    let (full, normal, dim) = match p {
        // P39-ish green (IBM 5151) and P134-ish amber; "bright" is the full colour.
        Phosphor::Green => ([0x5A, 0xFF, 0x6E], [0x2A, 0xC0, 0x40], [0x10, 0x60, 0x20]),
        Phosphor::Amber => ([0xFF, 0xC8, 0x40], [0xD0, 0x90, 0x10], [0x70, 0x48, 0x00]),
        Phosphor::White => ([0xFF, 0xFF, 0xFF], [0xAA, 0xAA, 0xAA], [0x55, 0x55, 0x55]),
    };
    [rgba([0, 0, 0]), rgba(dim), rgba(normal), rgba(full)]
}

pub struct Renderer {
    video_type: VideoType,
    mono: [u32; 4],
    cga: [u32; 16],
    w: u32,
    h: u32,
    buf: Vec<u32>,
}

impl Renderer {
    pub fn new(video_type: VideoType, phosphor: Phosphor) -> Self {
        let (w, h) = match video_type {
            VideoType::MDA => (720, 350),
            _ => (640, 400),
        };
        Self {
            video_type,
            mono: mono_palette(phosphor),
            cga: CGA_RGB.map(rgba),
            w,
            h,
            buf: vec![rgba([0, 0, 0]); (w * h) as usize],
        }
    }

    pub fn width(&self) -> u32 {
        self.w
    }

    pub fn height(&self) -> u32 {
        self.h
    }

    pub fn rgba(&self) -> &[u8] {
        // SAFETY-free: u32 -> u8 view of the same memory, little-endian RGBA.
        let ptr = self.buf.as_ptr() as *const u8;
        unsafe { std::slice::from_raw_parts(ptr, self.buf.len() * 4) }
    }

    pub fn draw(&mut self, card: &mut dyn VideoCard) {
        let extents = card.display_extents().clone();
        let ap = extents.apertures[DisplayApertureType::Cropped as usize].clone();
        let dbuf = card.buf(BufferSelect::Front);

        // Same rule as MartyPC: ignore the aperture offset if it would run off the field.
        let hx = if ap.x + ap.w > extents.field_w { 0 } else { ap.x };
        let vy = if ap.y + ap.h > extents.field_h { 0 } else { ap.y };
        let double = extents.double_scan || self.video_type == VideoType::CGA;
        let (w, h) = (ap.w, if double { ap.h * 2 } else { ap.h });
        if w != self.w || h != self.h {
            self.w = w;
            self.h = h;
            self.buf = vec![rgba([0, 0, 0]); (w * h) as usize];
        }

        let stride = extents.row_stride;
        let rows = ap.h as usize;
        let cols = ap.w as usize;
        for y in 0..rows {
            let src = (y + vy as usize) * stride + hx as usize;
            let Some(line) = dbuf.get(src..src + cols)
            else {
                break;
            };
            let dst_y = if double { y * 2 } else { y };
            let dst = &mut self.buf[dst_y * cols..(dst_y + 1) * cols];
            match self.video_type {
                VideoType::MDA => {
                    for (d, &s) in dst.iter_mut().zip(line) {
                        *d = self.mono[(s & 0x03) as usize];
                    }
                }
                _ => {
                    for (d, &s) in dst.iter_mut().zip(line) {
                        *d = self.cga[(s & 0x0F) as usize];
                    }
                }
            }
            if double {
                self.buf.copy_within(dst_y * cols..(dst_y + 1) * cols, (dst_y + 1) * cols);
            }
        }
    }
}
