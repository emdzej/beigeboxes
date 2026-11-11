// beigebox glue for vAmigaWeb. Loaded by embed.html after the upstream UI
// scripts and before vAmiga.js, so the core's first message already lands here.
// embed.html?cfg=<json>#{...upstream options...}
//   cfg: { rom: "aros"|"emutos", agnus, denise, chip_kb, slow_kb, fast_kb, cpu: 0|1|2, clock }
// SPDX-License-Identifier: GPL-3.0-or-later
(function () {
  "use strict";
  // Shipped, freely redistributable Kickstart replacements, as vAmigaWeb ships them.
  var ROMS = {
    aros: { rom: "roms/aros-rom-20260820.bin", ext: "roms/aros-ext-20260820.bin" },
    emutos: { rom: "roms/emutos-amiga.bin", ext: null },
  };

  var cfg = {};
  try { cfg = JSON.parse(new URLSearchParams(location.search).get("cfg") || "{}"); } catch (e) { /* defaults */ }

  var hoffmann = (window.hoffmann = { input: true, powered: true, cfg: cfg, romsInstalled: null });

  function post(m) {
    m.source = "hoffmann";
    try { window.parent.postMessage(m, location.origin); } catch (e) { /* detached */ }
  }

  function gate(e) {
    if (!hoffmann.input) { e.stopImmediatePropagation(); e.preventDefault(); }
  }
  ["keydown", "keyup", "keypress"].forEach(function (t) { window.addEventListener(t, gate, true); });

  hoffmann.setPowered = function (on) {
    hoffmann.powered = on;
    document.body.classList.toggle("hoffmann-off", !on);
  };

  async function bytes(url) {
    return new Uint8Array(await (await fetch(url)).arrayBuffer());
  }

  function hardware() {
    var lines = [];
    var map = {
      AGNUS_REVISION: cfg.agnus, DENISE_REVISION: cfg.denise,
      CHIP_RAM: cfg.chip_kb, SLOW_RAM: cfg.slow_kb, FAST_RAM: cfg.fast_kb,
      CPU_REVISION: cfg.cpu, CPU_OVERCLOCKING: cfg.clock,
    };
    for (var k in map) {
      if (map[k] === undefined || map[k] === null) continue;
      lines.push(k + "=" + map[k]);
      // The upstream UI re-reads these from localStorage; keep them in step.
      try { window.save_setting("OPT_" + k, String(map[k])); } catch (e) { /* ignore */ }
    }
    if (!lines.length) return "";
    return window.wasm_configure_multi(lines.join("\n"));
  }

  async function install() {
    var err = hardware();
    if (err) post({ msg: "error", error: "hardware: " + err });
    var set = ROMS[cfg.rom] || ROMS.aros;
    window.wasm_loadfile("kick.rom_file", await bytes(set.rom));
    if (set.ext) window.wasm_loadfile("kick.rom_ext_file", await bytes(set.ext));
    window.wasm_reset();
  }

  var upstream = window.message_handler;
  window.message_handler = function (msg, data1, data2) {
    if (msg === "MSG_ROM_MISSING") {
      // embed.html is opened with wait_for_kickstart_injection, so upstream does
      // nothing here; configure the machine, then inject the shipped ROM.
      hoffmann.romsInstalled = install().catch(function (e) { post({ msg: "error", error: String(e) }); });
      post({ msg: msg });
      return;
    }
    upstream(msg, data1, data2);
    post({ msg: msg, data1: data1, data2: data2 });
  };
})();
