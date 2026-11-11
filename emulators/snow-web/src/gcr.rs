//! Reading a floppy's sectors back out of the GCR bitstream Snow keeps, so a guest's writes can
//! be saved to the raw or DiskCopy 4.2 file the disk came from. Snow itself only writes MOOF.
//!
//! The inverse of `snow_floppy::macformat::MacFormatEncoder`: the IWM's view of the bits (a
//! byte ends at a set high bit), address and data marks, 6-and-2 GCR with its three running
//! checksums (after MESS, FluxEngine and Greaseweazle, as the encoder is).

use snow_floppy::{Floppy, FloppyImage, FloppyType, TrackLength};

const TAG: usize = 12;
const DATA: usize = 512;
const SECTOR: usize = TAG + DATA;
const SECTORS_PER_TRACK: [usize; 5] = [12, 11, 10, 9, 8];

#[rustfmt::skip]
const GCR_ENCTABLE: [u8; 64] = [
    0x96, 0x97, 0x9A, 0x9B, 0x9D, 0x9E, 0x9F, 0xA6, 0xA7, 0xAB, 0xAC, 0xAD, 0xAE, 0xAF, 0xB2, 0xB3,
    0xB4, 0xB5, 0xB6, 0xB7, 0xB9, 0xBA, 0xBB, 0xBC, 0xBD, 0xBE, 0xBF, 0xCB, 0xCD, 0xCE, 0xCF, 0xD3,
    0xD6, 0xD7, 0xD9, 0xDA, 0xDB, 0xDC, 0xDD, 0xDE, 0xDF, 0xE5, 0xE6, 0xE7, 0xE9, 0xEA, 0xEB, 0xEC,
    0xED, 0xEE, 0xEF, 0xF2, 0xF3, 0xF4, 0xF5, 0xF6, 0xF7, 0xF9, 0xFA, 0xFB, 0xFC, 0xFD, 0xFE, 0xFF,
];

fn gcr_decode_table() -> [u8; 256] {
    let mut t = [0xFFu8; 256];
    for (i, &b) in GCR_ENCTABLE.iter().enumerate() {
        t[b as usize] = i as u8;
    }
    t
}

/// The bytes the IWM would read off a track, twice round so a sector across the index is whole.
fn nibbles(img: &FloppyImage, side: usize, track: usize) -> Vec<u8> {
    let TrackLength::Bits(len) = img.get_track_length(side, track) else {
        return vec![];
    };
    if len == 0 {
        return vec![];
    }
    let mut out = Vec::with_capacity(len / 4);
    let mut reg: u8 = 0;
    for pos in 0..2 * len {
        reg = (reg << 1) | img.get_track_bit(side, track, pos % len) as u8;
        if reg & 0x80 != 0 {
            out.push(reg);
            reg = 0;
        }
    }
    out
}

/// Tag + data from the 703 6-bit values after a data mark's sector number, or None on a bad
/// checksum.
fn decode_data(w: &[u8]) -> Option<[u8; SECTOR]> {
    const GROUPS: usize = SECTOR / 3 + 1; // 175: the last holds two bytes
    let mut b1 = [0u8; GROUPS];
    let mut b2 = [0u8; GROUPS];
    let mut b3 = [0u8; GROUPS];
    let mut k = 0;
    for i in 0..GROUPS {
        let w4 = w[k];
        let w1 = w[k + 1];
        let w2 = w[k + 2];
        k += 3;
        let w3 = if i != GROUPS - 1 {
            k += 1;
            w[k - 1]
        } else {
            0
        };
        b1[i] = w1 | ((w4 << 2) & 0xC0);
        b2[i] = w2 | ((w4 << 4) & 0xC0);
        b3[i] = w3 | ((w4 << 6) & 0xC0);
    }

    let mut out = [0u8; SECTOR];
    let (mut c1, mut c2, mut c3) = (0u32, 0u32, 0u32);
    let mut n = 0;
    for j in 0..GROUPS {
        c1 = (c1 & 0xFF) << 1;
        if c1 & 0x100 != 0 {
            c1 += 1;
        }
        let v = b1[j] ^ (c1 as u8);
        c3 += v as u32;
        if c1 & 0x100 != 0 {
            c3 += 1;
            c1 &= 0xFF;
        }
        out[n] = v;

        let v = b2[j] ^ (c3 as u8);
        c2 += v as u32;
        if c3 > 0xFF {
            c2 += 1;
            c3 &= 0xFF;
        }
        out[n + 1] = v;
        n += 2;
        if n == SECTOR {
            break;
        }

        let v = b3[j] ^ (c2 as u8);
        c1 += v as u32;
        if c2 > 0xFF {
            c1 += 1;
            c2 &= 0xFF;
        }
        out[n] = v;
        n += 1;
    }

    let c4 = ((c1 & 0xC0) >> 6) | ((c2 & 0xC0) >> 4) | ((c3 & 0xC0) >> 2);
    let sum = [c4 as u8 & 0x3F, c3 as u8 & 0x3F, c2 as u8 & 0x3F, c1 as u8 & 0x3F];
    (w[k..k + 4] == sum).then_some(out)
}

/// Every sector found on the disk, by logical block number. Missing or unreadable: None.
pub fn sectors(img: &FloppyImage) -> Result<Vec<Option<[u8; SECTOR]>>, String> {
    let sides = match img.get_type() {
        FloppyType::Mac400K => 1,
        FloppyType::Mac800K => 2,
        FloppyType::Mfm144M => return Err("MFM disks can't be saved".into()),
    };
    let dec = gcr_decode_table();
    let total = img.get_type().get_sector_count();
    let mut found: Vec<Option<[u8; SECTOR]>> = vec![None; total];

    // Where each (track, side) starts, as the encoder numbers blocks.
    let mut first = [[0usize; 2]; 80];
    let mut at = 0;
    for (track, f) in first.iter_mut().enumerate() {
        for s in f.iter_mut().take(sides) {
            *s = at;
            at += SECTORS_PER_TRACK[track / 16];
        }
    }

    for track in 0..img.get_track_count().min(80) {
        for side in 0..sides {
            let nib = nibbles(img, side, track);
            let mut i = 0;
            while i + 3 + 5 < nib.len() {
                if nib[i..i + 3] != [0xD5, 0xAA, 0x96] {
                    i += 1;
                    continue;
                }
                let h: Vec<u8> = nib[i + 3..i + 8].iter().map(|&b| dec[b as usize]).collect();
                i += 8;
                if h.iter().any(|&v| v == 0xFF) || h[0] ^ h[1] ^ h[2] ^ h[3] != h[4] {
                    continue;
                }
                let htrack = (h[0] as usize) | (((h[2] & 1) as usize) << 6);
                let hside = ((h[2] >> 5) & 1) as usize;
                let hsector = h[1] as usize;
                if htrack >= 80 || hside >= sides || hsector >= SECTORS_PER_TRACK[htrack / 16] {
                    continue;
                }
                // The data mark follows within a few dozen bytes of gap.
                let Some(off) = nib[i..nib.len().min(i + 64)]
                    .windows(3)
                    .position(|w| w == [0xD5, 0xAA, 0xAD])
                else {
                    continue;
                };
                let d = i + off + 3;
                if d + 1 + 703 > nib.len() || dec[nib[d] as usize] as usize != hsector {
                    continue;
                }
                let w: Vec<u8> = nib[d + 1..d + 1 + 703].iter().map(|&b| dec[b as usize]).collect();
                if w.iter().any(|&v| v == 0xFF) {
                    continue;
                }
                let block = first[htrack][hside] + hsector;
                if found[block].is_none() {
                    found[block] = decode_data(&w);
                }
                i = d + 1 + 703;
            }
        }
    }
    Ok(found)
}

/// Data and tags of the whole disk, from what is on it now, the rest from `data`/`tags` as
/// they were (a sector the guest never wrote and the decoder couldn't read stays as it was).
fn merge(img: &FloppyImage, data: &[u8], tags: Option<&[u8]>) -> Result<(Vec<u8>, Vec<u8>), String> {
    let found = sectors(img)?;
    let total = found.len();
    if data.len() != total * DATA {
        return Err(format!("image is {} bytes, the disk {}", data.len(), total * DATA));
    }
    let mut out = data.to_vec();
    let mut tag_out = match tags {
        Some(t) if t.len() == total * TAG => t.to_vec(),
        _ => vec![0; total * TAG],
    };
    let mut missing = 0;
    for (n, s) in found.iter().enumerate() {
        match s {
            Some(s) => {
                tag_out[n * TAG..(n + 1) * TAG].copy_from_slice(&s[..TAG]);
                out[n * DATA..(n + 1) * DATA].copy_from_slice(&s[TAG..]);
            }
            None => missing += 1,
        }
    }
    if missing > 0 {
        log::warn!("floppy save: {missing} of {total} sectors unreadable, kept as they were");
    }
    Ok((out, tag_out))
}

/// A raw sector image (400K or 800K) with the guest's writes.
pub fn to_raw(img: &FloppyImage, source: &[u8]) -> Result<(Vec<u8>, Vec<u8>), String> {
    merge(img, source, None)
}

fn dc42_checksum(bytes: &[u8]) -> u32 {
    bytes.chunks(2).fold(0u32, |sum, w| {
        let word = u16::from_be_bytes([w[0], *w.get(1).unwrap_or(&0)]) as u32;
        sum.wrapping_add(word).rotate_right(1)
    })
}

/// A DiskCopy 4.2 image with the guest's writes: the same header, new data, tags and checksums.
pub fn to_dc42(img: &FloppyImage, source: &[u8]) -> Result<Vec<u8>, String> {
    const HDR: usize = 0x54;
    if source.len() < HDR {
        return Err("short DiskCopy header".into());
    }
    let data_size = u32::from_be_bytes(source[0x40..0x44].try_into().unwrap()) as usize;
    let tag_size = u32::from_be_bytes(source[0x44..0x48].try_into().unwrap()) as usize;
    if source.len() < HDR + data_size + tag_size {
        return Err("truncated DiskCopy image".into());
    }
    let data = &source[HDR..HDR + data_size];
    let tags = &source[HDR + data_size..HDR + data_size + tag_size];
    let (new_data, new_tags) = merge(img, data, Some(tags))?;
    let new_tags = if tag_size == new_tags.len() { new_tags } else { tags.to_vec() };

    let mut out = Vec::with_capacity(source.len());
    out.extend_from_slice(&source[..HDR]);
    out[0x48..0x4C].copy_from_slice(&dc42_checksum(&new_data).to_be_bytes());
    // The tag checksum leaves out the first sector's tags.
    let tag_sum = if new_tags.len() > TAG { dc42_checksum(&new_tags[TAG..]) } else { 0 };
    out[0x4C..0x50].copy_from_slice(&tag_sum.to_be_bytes());
    out.extend_from_slice(&new_data);
    out.extend_from_slice(&new_tags);
    out.extend_from_slice(&source[HDR + data_size + tag_size..]);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use snow_floppy::loaders::{FloppyImageLoader, RawImage};

    fn pattern(len: usize) -> Vec<u8> {
        (0..len).map(|i| ((i * 7 + i / 512 * 13) % 251) as u8).collect()
    }

    #[test]
    fn raw_800k_round_trip() {
        let data = pattern(800 * 1024);
        let img = RawImage::load(&data, Some("t.dsk")).unwrap();
        let found = sectors(&img).unwrap();
        assert!(found.iter().all(|s| s.is_some()), "every sector decodes");
        let (back, _) = merge(&img, &vec![0; data.len()], None).unwrap();
        assert!(back == data);
    }

    #[test]
    fn raw_400k_round_trip() {
        let data = pattern(400 * 1024);
        let img = RawImage::load(&data, Some("t.dsk")).unwrap();
        let (back, _) = merge(&img, &vec![0; data.len()], None).unwrap();
        assert!(back == data);
    }

    /// A guest write: track 0 rewritten with other sectors, bit by bit, as the drive does.
    #[test]
    fn written_track_is_saved() {
        let a = pattern(800 * 1024);
        let b: Vec<u8> = a.iter().map(|x| x ^ 0x5A).collect();
        let mut img = RawImage::load(&a, Some("a.dsk")).unwrap();
        let other = RawImage::load(&b, Some("b.dsk")).unwrap();
        let TrackLength::Bits(len) = other.get_track_length(0, 0) else { panic!() };
        let TrackLength::Bits(own) = img.get_track_length(0, 0) else { panic!() };
        assert_eq!(len, own);
        for pos in 0..len {
            img.set_track_bit(0, 0, pos, other.get_track_bit(0, 0, pos));
        }
        assert!(img.is_dirty());
        let (out, _) = to_raw(&img, &a).unwrap();
        // Track 0, side 0 holds blocks 0..12.
        assert!(out[..12 * 512] == b[..12 * 512]);
        assert!(out[12 * 512..] == a[12 * 512..]);
    }

    #[test]
    fn dc42_round_trip() {
        let data = pattern(400 * 1024);
        let tags = vec![0u8; 800 * 12];
        let mut src = vec![0u8; 0x54];
        src[0] = 4;
        src[1..5].copy_from_slice(b"TEST");
        src[0x40..0x44].copy_from_slice(&(data.len() as u32).to_be_bytes());
        src[0x44..0x48].copy_from_slice(&(tags.len() as u32).to_be_bytes());
        src[0x48..0x4C].copy_from_slice(&dc42_checksum(&data).to_be_bytes());
        src[0x50] = 0;
        src[0x51] = 0x02;
        src[0x52] = 0x01;
        src.extend_from_slice(&data);
        src.extend_from_slice(&tags);
        let mut img = snow_floppy::loaders::Diskcopy42::load(&src, None).unwrap();
        // Dirty it without changing anything: the file must come back identical.
        let bit = img.get_track_bit(0, 0, 0);
        img.set_track_bit(0, 0, 0, bit);
        assert_eq!(to_dc42(&img, &src).unwrap(), src);
    }

    #[test]
    fn dc42_checksum_of_zeros() {
        assert_eq!(dc42_checksum(&[0; 1024]), 0);
    }
}
