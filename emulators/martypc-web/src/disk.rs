// martypc-web: an in-memory disk image the core can own while JS can still read it back.
// Copyright (C) 2026 Michał Jaskólski
// SPDX-License-Identifier: GPL-3.0-or-later

use std::{
    cell::{Cell, RefCell},
    io::{self, Read, Seek, SeekFrom, Write},
    rc::Rc,
};

/// `VirtualHardDisk` takes ownership of a boxed Read+Write+Seek and never gives it back, so we
/// hand it one clone of this and keep another: same bytes, separate cursors. Also counts
/// accesses so the wrapper can drive an activity LED.
#[derive(Clone)]
pub struct SharedDisk {
    data: Rc<RefCell<Vec<u8>>>,
    accesses: Rc<Cell<u64>>,
    pos: u64,
}

impl SharedDisk {
    pub fn new(bytes: Vec<u8>) -> Self {
        Self {
            data: Rc::new(RefCell::new(bytes)),
            accesses: Rc::new(Cell::new(0)),
            pos: 0,
        }
    }

    pub fn bytes(&self) -> Vec<u8> {
        self.data.borrow().clone()
    }

    pub fn accesses(&self) -> u64 {
        self.accesses.get()
    }
}

impl Read for SharedDisk {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let data = self.data.borrow();
        let start = (self.pos as usize).min(data.len());
        let n = buf.len().min(data.len() - start);
        buf[..n].copy_from_slice(&data[start..start + n]);
        self.pos += n as u64;
        self.accesses.set(self.accesses.get() + 1);
        Ok(n)
    }
}

impl Write for SharedDisk {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let mut data = self.data.borrow_mut();
        let start = self.pos as usize;
        if data.len() < start + buf.len() {
            data.resize(start + buf.len(), 0);
        }
        data[start..start + buf.len()].copy_from_slice(buf);
        self.pos += buf.len() as u64;
        self.accesses.set(self.accesses.get() + 1);
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

impl Seek for SharedDisk {
    fn seek(&mut self, to: SeekFrom) -> io::Result<u64> {
        let len = self.data.borrow().len() as i64;
        let new = match to {
            SeekFrom::Start(p) => p as i64,
            SeekFrom::End(d) => len + d,
            SeekFrom::Current(d) => self.pos as i64 + d,
        };
        if new < 0 {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "seek before start"));
        }
        self.pos = new as u64;
        Ok(self.pos)
    }
}
