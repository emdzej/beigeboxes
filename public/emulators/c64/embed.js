// beigebox glue for vc64web. Loaded by embed.html after the upstream UI
// scripts and before vc64.js, so the core's first message already lands here.
// SPDX-License-Identifier: GPL-3.0-or-later
(function () {
  "use strict";
  // Shipped, freely redistributable system ROMs: MEGA65 Open ROMs (LGPL-3.0).
  // No 1541 ROM exists under a free licence, so none is shipped.
  var ROMS = ["roms/basic_generic.rom", "roms/kernal_generic.rom", "roms/chargen_pxlfont_2.3.rom"];

  var hoffmann = (window.hoffmann = { input: true, powered: true, romsInstalled: null });

  function post(m) {
    m.source = "hoffmann";
    try { window.parent.postMessage(m, location.origin); } catch (e) { /* detached */ }
  }

  // Keyboard focus is the parent's call: while input is off, nothing reaches the C64.
  function gate(e) {
    if (!hoffmann.input) { e.stopImmediatePropagation(); e.preventDefault(); }
  }
  ["keydown", "keyup", "keypress"].forEach(function (t) { window.addEventListener(t, gate, true); });

  hoffmann.setPowered = function (on) {
    hoffmann.powered = on;
    document.body.classList.toggle("hoffmann-off", !on);
  };

  async function installRoms() {
    for (var i = 0; i < ROMS.length; i++) {
      var name = ROMS[i];
      var bytes = new Uint8Array(await (await fetch(name)).arrayBuffer());
      // Straight into the core: nothing is written to localStorage.
      var type = window.wasm_loadfile(name.split("/").pop(), bytes, bytes.byteLength);
      if (!type) throw new Error("core rejected " + name);
    }
  }

  // The core calls the global `message_handler` by name; wrap it.
  var upstream = window.message_handler;
  window.message_handler = function (msg, data1, data2) {
    if (msg === "MSG_ROM_MISSING") {
      // Upstream would look in localStorage, then fetch Open ROMs from mega65.github.io
      // or open a dialog. Install the local copies instead.
      hoffmann.romsInstalled = installRoms().catch(function (e) { post({ msg: "error", error: String(e) }); });
      post({ msg: msg });
      return;
    }
    upstream(msg, data1, data2);
    post({ msg: msg, data1: data1, data2: data2 });
  };
})();
