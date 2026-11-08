// ==UserScript==
// @name         NRO Deep Memory Bot (100% WASM RAM State-Driven)
// @namespace    https://nroweb.com/
// @version      2.4.6
// @description  Bot chuyên sâu đọc/ghi trực tiếp bộ nhớ WebAssembly (HEAP32/HEAPU8/Float64) của game.wasm: Tự động di chuyển liên hành tinh qua Trạm Tàu Vũ Trụ (Trái Đất 24, Namếc 25, Xayda 26), tự làm nhiệm vụ Bái Sư & Bang Hội một mạch, tự né Boss & đổi khu vực.
// @author       Antigravity
// @match        https://nroweb.com/nro/*
// @match        http://nroweb.com/nro/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // Cho phép nạp đè bản mới nếu người dùng dán lại vào Console
  if (window.__NRO_DEEP_BOT_TIMER__) {
    clearInterval(window.__NRO_DEEP_BOT_TIMER__);
  }
  const oldHud = document.getElementById("nro-deep-bot-hud");
  if (oldHud) oldHud.remove();

  // ============================================================================
  // 1. ĐỊA CHỈ TYPEINFO & OFFSET CHÍNH XÁC TRONG GAME.WASM (IL2CPP METADATA V29)
  // ============================================================================
  const ADDR = {
    TileMap_TypeInfo: 2563188,        // TileMap class
    PickMob_TypeInfo: 2561780,        // Mod.XMAP.PickMob class
    AutoXmap_TypeInfo: 2558776,       // Mod.XMAP.AutoXmap class
    XmapController_TypeInfo: 2563860, // Mod.XMAP.XmapController class
    XmapData_TypeInfo: 2563864,       // Mod.XMAP.XmapData class
    ModFunc_TypeInfo: 2561364,        // ModFunc class (canUpdate +8, autoAttack +28, focusBoss +161)
    Char_TypeInfo: 2559056,           // Char class
    GameScr_TypeInfo: 2560084,        // GameScr class
    GameCanvas_TypeInfo: 2560064,     // GameCanvas class
    ChatPopup_TypeInfo: 2559076,      // ChatPopup class (currChatPopup +16, serverChatPopUp +20)
    InfoDlg_TypeInfo: 2560820,        // InfoDlg class
    Mob_TypeInfo: 2561352             // Mob class
  };

  // Danh sách tên Map chuẩn trong Ngọc Rồng
  const MAP_NAMES = {
    0: "Làng Aru", 1: "Đồi hoa cúc", 2: "Thung lũng tre", 3: "Rừng nấm", 4: "Rừng xương",
    5: "Đảo Kamê", 6: "Đông Karin", 7: "Làng Mori", 8: "Đồi nấm tím", 9: "Thị trấn Moori",
    10: "Thung lũng Namếc", 11: "Thung lũng Maima", 12: "Vực maima", 13: "Đảo Guru",
    14: "Làng Kakarot", 15: "Đồi hoang", 16: "Làng Plant", 17: "Rừng nguyên sinh",
    18: "Rừng thông Xayda", 19: "Thành phố Vegeta", 20: "Vách núi đen",
    21: "Nhà Gôhan", 22: "Nhà Moori", 23: "Nhà Broly",
    24: "Trạm tàu vũ trụ Trái Đất", 25: "Trạm tàu vũ trụ Namếc", 26: "Trạm tàu vũ trụ Xayda",
    27: "Rừng Bamboo", 28: "Rừng dương xỉ", 29: "Nam Kamê", 30: "Đảo Bulông",
    31: "Núi hoa vàng", 32: "Núi hoa tím", 33: "Nam Guru", 34: "Đông Nam Guru",
    35: "Rừng cọ", 36: "Rừng đá", 37: "Thung lũng đen", 38: "Bờ vực đen",
    42: "Vách núi Aru", 43: "Vách núi Moori", 44: "Vách núi Kakarot",
    45: "Thần điện", 46: "Tháp Karin", 47: "Rừng Karin",
    52: "Đại hội võ thuật", 64: "Núi dây leo", 65: "Núi cây quỷ", 68: "Thung lũng Nappa", 84: "Siêu thị"
  };

  function normalizeText(s) {
    return (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .trim();
  }

  // Kiểm tra bước nhiệm vụ có phải là nhiệm vụ diệt Trùm (Boss) hay không
  function isBossQuestStep(stepText) {
    const s = normalizeText(stepText);
    return (
      s.includes("akkuman") ||
      s.includes("tamborine") ||
      s.includes("drum") ||
      s.includes("tau pay pay") ||
      s.includes("kuku") ||
      s.includes("map dau dinh") ||
      s.includes("rambo") ||
      s.includes("tieu doi") ||
      s.includes("fide") ||
      s.includes("android") ||
      s.includes("king kong") ||
      s.includes("xen bo hung")
    );
  }

  // Kiểm tra bước nhiệm vụ có phải là Đánh quái / Nhặt vật phẩm (kể cả khi max = 0 như "Đánh bọn ốc sên lấy truyện (0/0)")
  function isMobKillOrCollectStep(stepText) {
    const s = normalizeText(stepText || "");
    if (!s) return false;
    // Nếu là bước báo cáo hoặc nộp/bái sư thuần túy (không có hành động đánh) -> KHÔNG phải đánh quái
    if (
      s.includes("bao cao") ||
      s.includes("noi chuyen") ||
      s.includes("gap ") ||
      s.includes("ve nha") ||
      s.includes("quay ve")
    ) {
      return false;
    }
    if ((s.includes("bai su") || s.includes("giao truyen") || s.includes("nop truyen") || s.includes("nhan su phu")) && !s.includes("danh") && !s.includes("lay") && !s.includes("tim")) {
      return false;
    }
    return (
      s.includes("danh ") ||
      s.includes("tieu diet") ||
      s.includes("ha ") ||
      s.includes("san ") ||
      s.includes("lay truyen") ||
      s.includes("tim truyen") ||
      s.includes("thu thap") ||
      s.includes("oc sen") ||
      s.includes("oc muon hon") ||
      s.includes("quy dau nhon") ||
      s.includes("than lan") ||
      s.includes("bulon") ||
      s.includes("ukulele") ||
      s.includes("quy map") ||
      s.includes("heo ")
    );
  }

  // Kiểm tra bước nhiệm vụ có phải là Báo cáo / Nói chuyện với NPC hay không
  function isNpcReportStep(stepText) {
    const s = normalizeText(stepText || "");
    if (!s) return false;

    // 1. Các hành động nói chuyện / báo cáo / gặp mặt thuần túy
    if (
      s.includes("bao cao") ||
      s.includes("noi chuyen") ||
      s.includes("gap ") ||
      s.includes("ve nha") ||
      s.includes("quay ve")
    ) {
      return true;
    }

    // 2. Tên Sư phụ & NPC chính tuyến (chỉ khi KHÔNG phải bước đánh/tìm)
    if (isMobKillOrCollectStep(stepText) || s.includes("tim ") || s.includes("danh ") || s.includes("san ")) {
      return false;
    }
    if (
      s.includes("quy lao") ||
      s.includes("truong lao") ||
      s.includes("vua vegeta") ||
      s.includes("ong gohan") ||
      s.includes("ong moori") ||
      s.includes("ong paragus") ||
      s.includes("bo mong") ||
      s.includes("than meo") ||
      s.includes("thuong de") ||
      s.includes("bunma") ||
      s.includes("dende") ||
      s.includes("appule")
    ) {
      return true;
    }

    // 3. Bái sư / Giao truyện
    if (
      (s.includes("bai su") || s.includes("giao truyen") || s.includes("nop truyen") || s.includes("nhan su phu")) &&
      !s.includes("danh") && !s.includes("lay") && !s.includes("tim")
    ) {
      return true;
    }

    return false;
  }

  // Bảng ánh xạ tự động từ tên Quái / Trùm / NPC trong RAM -> Map ID chuẩn xác 100%
  function resolveQuestStepToMapId(stepText, detailText, cgender) {
    const stepNorm = normalizeText(stepText || "");
    const detailNorm = normalizeText(detailText || "");

    // 0. Nhiệm vụ tiêu diệt Trùm (Boss): Akkuman / Tamborine / Drum / Tàu Pảy Pảy / Kuku...
    if (stepNorm.includes("akkuman")) return 19;      // Akkuman tại Thành phố Vegeta - Map ID 19
    if (stepNorm.includes("tamborine")) return 6;     // Tamborine tại Đông Karin - Map ID 6
    if (stepNorm.includes("drum")) return 10;         // Drum tại Thung lũng Namếc - Map ID 10
    if (stepNorm.includes("tau pay pay")) return 47;  // Tàu Pảy Pảy tại Rừng Karin - Map ID 47
    if (stepNorm.includes("kuku")) return 68;         // Kuku tại Thung lũng Nappa - Map ID 68
    if (stepNorm.includes("map dau dinh")) return 64; // Mập Đầu Đinh tại Núi dây leo - Map ID 64
    if (stepNorm.includes("rambo")) return 65;        // Rambo tại Núi cây quỷ - Map ID 65

    // 1. Nhiệm vụ Bang hội 2 & các quái đặc trưng:
    if (stepNorm.includes("bulon")) return 30;        // Bulon tại Đảo Bulông (Trái Đất) - Map ID 30
    if (stepNorm.includes("ukulele")) return 34;      // Ukulele tại Đông Nam Guru (Namếc) - Map ID 34
    if (stepNorm.includes("quy map")) return 38;      // Quỷ mập tại Bờ Vực Đen (Xayda) - Map ID 38

    // 2. Nhiệm vụ 3 loại Heo:
    if (stepNorm.includes("heo rung")) return 27;     // Rừng Bamboo - Map ID 27
    if (stepNorm.includes("heo da xanh")) return 31;  // Núi hoa vàng - Map ID 31
    if (stepNorm.includes("heo xayda")) return 35;    // Rừng cọ - Map ID 35

    // 3. Nhiệm vụ Bái sư (Truyện Doremon tập 2) & các quái nhiệm vụ chính tuyến:
    // Quái đánh săn rơi Truyện theo từng hành tinh:
    // - Namếc (cgender = 1): Ốc sên -> Núi hoa vàng (Map ID 31)
    // - Trái Đất (cgender = 0): Ốc mượn hồn -> Đảo Kamê (Map ID 5)
    // - Xayda (cgender = 2): Quỷ đầu nhọn -> Vách núi đen (Map ID 20)
    if (stepNorm.includes("oc sen")) return 31;       // Ốc sên tại Núi hoa vàng - Map ID 31
    if (stepNorm.includes("oc muon hon")) return 5;   // Ốc mượn hồn tại Đảo Kamê - Map ID 5
    if (stepNorm.includes("quy dau nhon")) return 20; // Quỷ đầu nhọn tại Vách núi đen - Map ID 20
    if (stepNorm.includes("than lan xanh")) return 29;// Thằn lằn xanh tại Nam Kamê - Map ID 29

    // Bước Bái Sư / Giao truyện / Báo cáo Sư Phụ theo từng hành tinh:
    // - Namếc (cgender = 1): Trưởng Lão Guru tại Đảo Guru (Map ID 13)
    // - Trái Đất (cgender = 0): Quy Lão Kamê tại Đảo Kamê (Map ID 5)
    // - Xayda (cgender = 2): Vua Vegeta tại Vách Núi Đen (Map ID 20)
    if (
      stepNorm.includes("bai su") ||
      stepNorm.includes("giao truyen") ||
      stepNorm.includes("nop truyen") ||
      stepNorm.includes("nhan su phu") ||
      (stepNorm.includes("su phu") && !stepNorm.includes("danh"))
    ) {
      if (cgender === 1) return 13; // Sư phụ Namếc: Trưởng Lão Guru (Đảo Guru - Map 13)
      if (cgender === 2) return 20; // Sư phụ Xayda: Vua Vegeta (Vách núi đen - Map 20)
      return 5;                     // Sư phụ Trái Đất: Quy Lão Kamê (Đảo Kamê - Map 5)
    }

    if (stepNorm.includes("truyen") || detailNorm.includes("doremon")) {
      // Nếu là bước đánh quái tìm/lấy truyện
      if (
        stepNorm.includes("danh") ||
        stepNorm.includes("lay") ||
        stepNorm.includes("tim") ||
        stepNorm.includes("san") ||
        detailNorm.includes("danh") ||
        detailNorm.includes("lay")
      ) {
        if (detailNorm.includes("oc sen") || stepNorm.includes("oc sen") || cgender === 1) return 31; // Núi hoa vàng (Map 31)
        if (detailNorm.includes("oc muon hon") || stepNorm.includes("oc muon hon") || cgender === 0) return 5; // Đảo Kamê (Map 5)
        if (detailNorm.includes("quy dau nhon") || stepNorm.includes("quy dau nhon") || cgender === 2) return 20; // Vách núi đen (Map 20)
      }
      // Nếu là bước nộp / giao / bái sư
      if (cgender === 1) return 13; // Sư phụ Namếc: Đảo Guru (Map 13)
      if (cgender === 2) return 20; // Sư phụ Xayda: Vách núi đen (Map 20)
      return 5;                     // Sư phụ Trái Đất: Đảo Kamê (Map 5)
    }

    if (stepNorm.includes("moc nhan")) return cgender === 0 ? 0 : (cgender === 1 ? 7 : 14);
    if (stepNorm.includes("khung long me")) return 2;
    if (stepNorm.includes("khung long")) return 1;
    if (stepNorm.includes("lon loi me")) return 9;
    if (stepNorm.includes("lon loi")) return 8;
    if (stepNorm.includes("quy dia nguc")) return 16;
    if (stepNorm.includes("quy dat")) return 15;
    if (stepNorm.includes("than lan me")) return 4;
    if (stepNorm.includes("than lan bay")) return 3;
    if (stepNorm.includes("phi long me")) return 12;
    if (stepNorm.includes("phi long")) return 10;
    if (stepNorm.includes("quy bay me")) return 18;
    if (stepNorm.includes("quy bay")) return 17;

    // 4. Báo cáo nhiệm vụ / Gặp NPC:
    if (stepNorm.includes("quy lao") || stepNorm.includes("dao kame")) return 5;
    if (stepNorm.includes("truong lao") || stepNorm.includes("dao guru")) return 13;
    if (stepNorm.includes("vua vegeta") || stepNorm.includes("vach nui den")) return 20;
    if (stepNorm.includes("bo mong") || stepNorm.includes("rung karin")) return 47;
    if (stepNorm.includes("than meo") || stepNorm.includes("thap karin")) return 46;
    if (stepNorm.includes("thuong de") || stepNorm.includes("than dien")) return 45;
    if (stepNorm.includes("bunma")) return 0;
    if (stepNorm.includes("dende")) return 7;
    if (stepNorm.includes("appule")) return 14;
    if (stepNorm.includes("ong gohan")) return 21;
    if (stepNorm.includes("ong moori")) return 22;
    if (stepNorm.includes("ong paragus")) return 23;

    if (
      stepNorm.includes("bao cao") ||
      stepNorm.includes("noi chuyen") ||
      stepNorm.includes("quay ve") ||
      stepNorm.includes("ve nha") ||
      stepNorm.includes("gap ")
    ) {
      if (stepNorm.includes("su phu") || stepNorm.includes("bai su")) {
        if (cgender === 1) return 13; // Guru (Namếc)
        if (cgender === 2) return 20; // Vua Vegeta (Xayda)
        return 5;                     // Quy Lão (Trái Đất)
      }
      return 21 + (cgender || 0);
    }

    // 5. Dò tên Map trực tiếp (ưu tiên tên DÀI trước để "Đông Nam Guru" thắng "Nam Guru")
    const mapEntriesByLen = Object.entries(MAP_NAMES).sort((a, b) => b[1].length - a[1].length);
    for (const [idStr, mName] of mapEntriesByLen) {
      const mNorm = normalizeText(mName);
      if (mNorm.length >= 5 && stepNorm.includes(mNorm)) {
        return Number(idStr);
      }
    }
    for (const [idStr, mName] of mapEntriesByLen) {
      const mNorm = normalizeText(mName);
      if (mNorm.length >= 5 && detailNorm.includes(mNorm)) {
        return Number(idStr);
      }
    }

    return null;
  }

  // ============================================================================
  // 2. KỊCH BẢN NHIỆM VỤ (CHẾ ĐỘ TỰ ĐỘNG ĐỌC RAM + CÁC PRESET CỐ ĐỊNH)
  // ============================================================================
  const QUEST_PRESETS = {
    "auto_ram_quest": {
      name: "🤖 Tự động 100% theo Nhiệm Vụ trong Game (Đọc RAM + Tự báo cáo NPC)",
      autoFromRam: true,
      loop: true,
      stages: []
    },
    "quest_comic_snail": {
      name: "📚 NV Bái Sư / Ốc Truyện Tranh (Săn Map 31/5/20 ➔ Bái Sư Phụ 13/5/20)",
      autoFromRam: true,
      preferComicSnail: true,
      loop: false,
      stages: [
        {
          name: "Đánh Ốc sên / Ốc mượn hồn / Quỷ đầu nhọn lấy Truyện Doremon tập 2",
          mapId: "COMIC_MOB",
          targetKills: 1,
          mobNameHint: "Ốc"
        },
        {
          name: "Bái Sư / Giao Truyện cho Sư Phụ (Guru 13 / Quy Lão 5 / Vegeta 20)",
          mapId: "MASTER",
          targetKills: 0,
          isNpcStep: true
        }
      ]
    },
    "boss_quest_trums": {
      name: "👑 NV Tiêu Diệt Trùm: Akkuman (19) → Tamborine (6) → Drum (10)",
      loop: false,
      stages: [
        {
          name: "Tiêu diệt Akkuman (Thành phố Vegeta)",
          mapId: 19,
          targetKills: 1,
          isBossStep: true,
          mobNameHint: "Akkuman"
        },
        {
          name: "Tiêu diệt Tamborine (Đông Karin)",
          mapId: 6,
          targetKills: 1,
          isBossStep: true,
          mobNameHint: "Tamborine"
        },
        {
          name: "Tiêu diệt Drum (Thung lũng Namếc)",
          mapId: 10,
          targetKills: 1,
          isBossStep: true,
          mobNameHint: "Drum"
        },
        {
          name: "Quay về Nhà báo cáo NPC",
          mapId: "HOME",
          targetKills: 0,
          isNpcStep: true
        }
      ]
    },
    "clan_quest_bulon": {
      name: "NV Bang Hội 2: Bulon (Map 30) → Ukulele (Map 34) → Quỷ Mập (Map 38)",
      loop: true,
      stages: [
        {
          name: "Tiêu diệt Bulon (Đảo Bulông - Trái Đất)",
          mapId: 30,        // Đảo Bulông (Trái Đất)
          targetKills: 30,
          mobNameHint: "Bulon"
        },
        {
          name: "Tiêu diệt Ukulele (Đông Nam Guru - Namếc)",
          mapId: 34,        // Đông Nam Guru (Namếc)
          targetKills: 30,
          mobNameHint: "Ukulele"
        },
        {
          name: "Tiêu diệt Quỷ Mập (Bờ Vực Đen - Xayda)",
          mapId: 38,        // Bờ Vực Đen (Xayda)
          targetKills: 30,
          mobNameHint: "Quỷ mập"
        },
        {
          name: "Quay về Đảo Kamê hoàn thành",
          mapId: 5,         // Đảo Kamê
          targetKills: 0,
          isNpcStep: true
        }
      ]
    },
    "quest_pigs": {
      name: "NV Săn 3 Loại Heo: Rừng Bamboo (27) → Núi hoa vàng (31) → Rừng cọ (35)",
      loop: false,
      stages: [
        {
          name: "Đánh Heo Rừng (Rừng Bamboo)",
          mapId: 27,
          targetKills: 20,
          mobNameHint: "Heo rừng"
        },
        {
          name: "Đánh Heo Da Xanh (Núi hoa vàng)",
          mapId: 31,
          targetKills: 20,
          mobNameHint: "Heo da xanh"
        },
        {
          name: "Đánh Heo Xayda (Rừng cọ)",
          mapId: 35,
          targetKills: 20,
          mobNameHint: "Heo Xayda"
        },
        {
          name: "Quay về Nhà báo cáo nhiệm vụ",
          mapId: "HOME",
          targetKills: 0,
          isNpcStep: true
        }
      ]
    },
    "custom_single_map": {
      name: "Tùy chỉnh: Xmap tới Map ID & Đánh đủ N con quái",
      loop: true,
      stages: [
        {
          name: "Tàn sát tại Map chỉ định",
          mapId: 30,
          targetKills: 30,
          mobNameHint: ""
        }
      ]
    }
  };

  // ============================================================================
  // 3. HOOK WEBGLL2 ĐỂ BẮT TRỰC TIẾP WASM MEMORY BUFFER (HEAPU8 / HEAP32 / F64)
  // ============================================================================
  let wasmBuffer = null;
  let wasmView = null;
  let HEAP8 = null;
  let HEAPU8 = null;
  let HEAP16 = null;
  let HEAPU16 = null;
  let HEAP32 = null;
  let HEAPU32 = null;

  function updateTypedArrays(buf) {
    if (!buf || wasmBuffer === buf) return;
    wasmBuffer = buf;
    wasmView = new DataView(buf);
    HEAP8 = new Int8Array(buf);
    HEAPU8 = new Uint8Array(buf);
    HEAP16 = new Int16Array(buf);
    HEAPU16 = new Uint16Array(buf);
    HEAP32 = new Int32Array(buf);
    HEAPU32 = new Uint32Array(buf);
    console.log("[NRO Deep Bot v2.2] Đã kết nối trực tiếp vào bộ nhớ WASM (" + (buf.byteLength / (1024 * 1024)).toFixed(1) + " MB)!");
  }

  if (typeof WebGL2RenderingContext !== "undefined") {
    if (!WebGL2RenderingContext.prototype.__origBufferSubData) {
      WebGL2RenderingContext.prototype.__origBufferSubData = WebGL2RenderingContext.prototype.bufferSubData;
    }
    const origBufferSubData = WebGL2RenderingContext.prototype.__origBufferSubData;
    WebGL2RenderingContext.prototype.bufferSubData = function (target, offset, srcData, srcOffset, length) {
      if (srcData && srcData.buffer && srcData.buffer.byteLength > 16 * 1024 * 1024) {
        if (wasmBuffer !== srcData.buffer) {
          updateTypedArrays(srcData.buffer);
        }
      }
      return origBufferSubData.apply(this, arguments);
    };
  }

  // ============================================================================
  // 4. CÁC HÀM ĐỌC / GHI TRỰC TIẾP RAM CỦA GAME.WASM (CHUẨN FLOAT64 & IL2CPP)
  // ============================================================================
  function isMemoryReady() {
    if (!wasmBuffer) return false;
    if (wasmBuffer.detached) {
      wasmBuffer = null;
      wasmView = null;
      return false;
    }
    return true;
  }

  function readF64(byteOffset) {
    if (!isMemoryReady() || byteOffset <= 0 || byteOffset + 8 > wasmBuffer.byteLength) return 0;
    const val = wasmView.getFloat64(byteOffset, true);
    if (!Number.isFinite(val)) return 0;
    return Math.floor(val);
  }

  function getStaticFieldsPtr(typeInfoAddr) {
    if (!isMemoryReady()) return 0;
    const klassPtr = HEAPU32[typeInfoAddr >> 2];
    if (!klassPtr || klassPtr >= wasmBuffer.byteLength) return 0;
    const staticPtr = HEAPU32[(klassPtr + 92) >> 2];
    if (!staticPtr || staticPtr >= wasmBuffer.byteLength) return 0;
    return staticPtr;
  }

  // QUAN TRỌNG NHẤT: Trong GameScr.update() (Fn 21810 @799), AutoXmap.Update() (Fn 22060)
  // bị khóa sau điều kiện `if (ModFunc.gI().canUpdate)` (tức `HEAPU8[modFuncInstance + 8] != 0`).
  // Vì HttpClient.GetStringAsync trong WebGL bị lỗi CORS nên canUpdate mặc định bị kẹt = 0!
  // Hàm này mở khóa trực tiếp `ModFunc.gI().canUpdate = 1` trong RAM!
  function ensureModFuncCanUpdate() {
    const modFuncStatic = getStaticFieldsPtr(ADDR.ModFunc_TypeInfo);
    if (!modFuncStatic) return false;
    const modFuncInstance = HEAPU32[(modFuncStatic + 0) >> 2];
    if (!modFuncInstance || modFuncInstance >= wasmBuffer.byteLength) return false;
    if (HEAPU8[modFuncInstance + 8] === 0) {
      HEAPU8[modFuncInstance + 8] = 1; // ModFunc.gI().canUpdate = true!
      console.log("[NRO Deep Bot v2.2] Đã mở khóa ModFunc.gI().canUpdate = 1 trong RAM (Kích hoạt vòng lặp AutoXmap.Update)!");
    }
    return true;
  }

  function readIl2CppString(strPtr) {
    if (!isMemoryReady() || !strPtr || strPtr >= wasmBuffer.byteLength) return "";
    const len = HEAP32[(strPtr + 8) >> 2];
    if (len <= 0 || len > 1024) return "";
    const startIdx = (strPtr + 12) >> 1;
    if ((startIdx + len) * 2 >= wasmBuffer.byteLength) return "";
    let out = "";
    for (let i = 0; i < len; i++) {
      out += String.fromCharCode(HEAPU16[startIdx + i]);
    }
    return out;
  }

  function readIl2CppStringArray(arrPtr) {
    const out = [];
    if (!isMemoryReady() || !arrPtr || arrPtr >= wasmBuffer.byteLength) return out;
    const len = HEAP32[(arrPtr + 12) >> 2];
    if (len <= 0 || len > 100) return out;
    for (let i = 0; i < len; i++) {
      const strPtr = HEAPU32[(arrPtr + 16 + i * 4) >> 2];
      out.push(readIl2CppString(strPtr));
    }
    return out;
  }

  function readMyVector(vecPtr) {
    const result = [];
    if (!isMemoryReady() || !vecPtr || vecPtr >= wasmBuffer.byteLength) return result;
    const listPtr = HEAPU32[(vecPtr + 8) >> 2];
    if (!listPtr || listPtr >= wasmBuffer.byteLength) return result;
    const itemsArrayPtr = HEAPU32[(listPtr + 8) >> 2];
    const size = HEAP32[(listPtr + 12) >> 2];
    if (!itemsArrayPtr || size <= 0 || size > 500) return result;
    for (let i = 0; i < size; i++) {
      const elemPtr = HEAPU32[(itemsArrayPtr + 16 + i * 4) >> 2];
      if (elemPtr && elemPtr < wasmBuffer.byteLength) {
        result.push(elemPtr);
      }
    }
    return result;
  }

  function getMobTemplateName(templateId) {
    if (!isMemoryReady() || templateId < 0 || templateId > 500) return "";
    const mobStatic = getStaticFieldsPtr(ADDR.Mob_TypeInfo);
    if (!mobStatic) return "";
    const arrTemplatePtr = HEAPU32[(mobStatic + 0) >> 2];
    if (!arrTemplatePtr || arrTemplatePtr >= wasmBuffer.byteLength) return "";
    const len = HEAP32[(arrTemplatePtr + 12) >> 2];
    if (templateId >= len) return "";
    const tplPtr = HEAPU32[(arrTemplatePtr + 16 + templateId * 4) >> 2];
    if (!tplPtr || tplPtr >= wasmBuffer.byteLength) return "";
    for (const off of [16, 20, 24, 12]) {
      const s = readIl2CppString(HEAPU32[(tplPtr + off) >> 2]);
      if (s && s.length >= 2) return s;
    }
    return "Mob#" + templateId;
  }

  // Đọc toàn bộ trạng thái thực tế của Game trong RAM
  function readGameState() {
    if (!isMemoryReady()) return null;

    // Luôn đảm bảo ModFunc.gI().canUpdate = 1 để GameScr.update() gọi AutoXmap.Update() mỗi frame
    ensureModFuncCanUpdate();

    const tileMapStatic = getStaticFieldsPtr(ADDR.TileMap_TypeInfo);
    const pickMobStatic = getStaticFieldsPtr(ADDR.PickMob_TypeInfo);
    const autoXmapStatic = getStaticFieldsPtr(ADDR.AutoXmap_TypeInfo);
    const xmapCtrlStatic = getStaticFieldsPtr(ADDR.XmapController_TypeInfo);
    const xmapDataStatic = getStaticFieldsPtr(ADDR.XmapData_TypeInfo);
    const charStatic = getStaticFieldsPtr(ADDR.Char_TypeInfo);
    const gameScrStatic = getStaticFieldsPtr(ADDR.GameScr_TypeInfo);
    const gameCanvasStatic = getStaticFieldsPtr(ADDR.GameCanvas_TypeInfo);
    const infoDlgStatic = getStaticFieldsPtr(ADDR.InfoDlg_TypeInfo);

    if (!tileMapStatic || !charStatic || !gameScrStatic) return null;

    const mapId = HEAP32[(tileMapStatic + 124) >> 2];
    const zoneId = HEAP32[(tileMapStatic + 132) >> 2];
    const planetId = HEAP32[(tileMapStatic + 152) >> 2];
    const rawMapName = readIl2CppString(HEAPU32[(tileMapStatic + 116) >> 2]);
    const mapName = rawMapName || MAP_NAMES[mapId] || ("Map " + mapId);

    const myCharPtr = HEAPU32[(charStatic + 88) >> 2];
    if (!myCharPtr || myCharPtr >= wasmBuffer.byteLength) return null;

    const cx = HEAP32[(myCharPtr + 80) >> 2];
    const cy = HEAP32[(myCharPtr + 84) >> 2];
    const statusMe = HEAP32[(myCharPtr + 108) >> 2];
    let cgender = HEAP32[(myCharPtr + 120) >> 2]; // +120: cgender (0: Trái Đất, 1: Namếc, 2: Xayda)

    const cMP = readF64(myCharPtr + 184);
    const cHP = readF64(myCharPtr + 192);
    const cHPFull = readF64(myCharPtr + 248);
    const cMPFull = readF64(myCharPtr + 256);

    if (cgender < 0 || cgender > 2) { if (!window.__NRO_OFFSET_WARNED__) { window.__NRO_OFFSET_WARNED__ = true; console.warn('[NRO Deep Bot] cgender doc tu RAM = ' + cgender + ' (ngoai 0..2): offset +120 co the sai, tam dung ve 0'); } cgender = 0; }
    const isDie = statusMe === 14 || HEAPU8[myCharPtr + 310] === 1 || (cHPFull > 0 && cHP <= 0);
    const isChangingMap = HEAPU8[myCharPtr + 34] === 1;
    const mobFocusPtr = HEAPU32[(myCharPtr + 568) >> 2];
    const npcFocusPtr = HEAPU32[(myCharPtr + 580) >> 2];
    const charFocusPtr = HEAPU32[(myCharPtr + 584) >> 2];

    const isInfoDlgShowing = infoDlgStatic ? (HEAPU8[infoDlgStatic + 16] === 1) : false;

    const tanSat = pickMobStatic ? (HEAPU8[pickMobStatic + 8] === 1) : false;
    const neSieuQuai = pickMobStatic ? (HEAPU8[pickMobStatic + 10] === 1) : false;
    const vuotDiaHinh = pickMobStatic ? (HEAPU8[pickMobStatic + 11] === 1) : false;
    const telePem = pickMobStatic ? (HEAPU8[pickMobStatic + 12] === 1) : false;
    const isGoBack = pickMobStatic ? (HEAPU8[pickMobStatic + 13] === 1) : false;
    const mapGoback = pickMobStatic ? HEAP32[(pickMobStatic + 16) >> 2] : -1;
    const zoneGoback = pickMobStatic ? HEAP32[(pickMobStatic + 20) >> 2] : -1;

    const isXmapRunning = autoXmapStatic ? (HEAPU8[autoXmapStatic + 0] === 1) : false;
    const xmapTargetId = xmapCtrlStatic ? HEAP32[(xmapCtrlStatic + 20) >> 2] : -1;

    // Đọc danh sách Quái trong Map (GameScr.vMob) - chuẩn Fn 22119: status (+96) >= 2 && f64 hp (+64) > 0
    const vMobPtr = HEAPU32[(gameScrStatic + 256) >> 2];
    const mobPtrs = readMyVector(vMobPtr);
    const mobs = [];
    let aliveMobs = 0;

    for (let i = 0; i < mobPtrs.length; i++) {
      const mPtr = mobPtrs[i];
      const hp = readF64(mPtr + 64);
      const maxHp = readF64(mPtr + 72);
      const mx = HEAP32[(mPtr + 80) >> 2] || HEAP32[(mPtr + 112) >> 2];
      const my = HEAP32[(mPtr + 84) >> 2] || HEAP32[(mPtr + 116) >> 2];
      const status = HEAP32[(mPtr + 96) >> 2];
      const mobId = HEAP32[(mPtr + 152) >> 2];
      const templateId = HEAP32[(mPtr + 192) >> 2];
      const isMobMe = HEAPU8[mPtr + 231] === 1;
      const alive = !isMobMe && status >= 2 && hp > 0;
      if (alive) aliveMobs++;

      mobs.push({
        ptr: mPtr,
        mobId,
        templateId,
        hp,
        maxHp,
        status,
        x: mx,
        y: my,
        alive,
        isFocused: mPtr === mobFocusPtr
      });
    }

    // Đọc danh sách NPC trong Map (GameScr.vNpc tại +260)
    const vNpcPtr = HEAPU32[(gameScrStatic + 260) >> 2];
    const npcPtrs = readMyVector(vNpcPtr);
    const npcs = [];
    for (let i = 0; i < npcPtrs.length; i++) {
      const nPtr = npcPtrs[i];
      const isHide = HEAPU8[nPtr + 1500] === 1;
      if (isHide) continue;
      const nx = HEAP32[(nPtr + 80) >> 2];
      const ny = HEAP32[(nPtr + 84) >> 2];
      const tplPtr = HEAPU32[(nPtr + 1484) >> 2];
      const templateId = (tplPtr && tplPtr < wasmBuffer.byteLength) ? HEAP32[(tplPtr + 8) >> 2] : -1;
      const name = (tplPtr && tplPtr < wasmBuffer.byteLength) ? readIl2CppString(HEAPU32[(tplPtr + 12) >> 2]) : "";
      npcs.push({
        ptr: nPtr,
        templateId,
        name,
        x: nx,
        y: ny,
        isFocused: nPtr === npcFocusPtr
      });
    }

    // Đọc danh sách Nhân vật / Boss trong khu (GameScr.vCharInMap tại +240)
    // Offset chuẩn Fn 20185 (ModFunc.AutoFocusBoss): charID (+116), cTypePk (+553), cName (+376)
    const vCharPtr = HEAPU32[(gameScrStatic + 240) >> 2];
    const charPtrs = readMyVector(vCharPtr);
    let bossDetected = null;
    const charsInMap = [];
    for (let i = 0; i < charPtrs.length; i++) {
      const cPtr = charPtrs[i];
      if (cPtr === myCharPtr) continue;
      const charHP = readF64(cPtr + 192);
      const charHPFull = readF64(cPtr + 248);
      const charID = HEAP32[(cPtr + 116) >> 2];
      const cTypePk = HEAP8[cPtr + 553];
      const cName = readIl2CppString(HEAPU32[(cPtr + 376) >> 2]);
      const charX = HEAP32[(cPtr + 80) >> 2];
      const charY = HEAP32[(cPtr + 84) >> 2];
      const nameUpper = (cName || "").toUpperCase().trim();
      const isPetOrDisciple = (
        nameUpper === "$" ||
        nameUpper.includes("DE TU") ||
        nameUpper.includes("ĐỆ TỬ") ||
        nameUpper.startsWith("PET") ||
        nameUpper.includes("PET") ||
        nameUpper === "THO NGOC" ||
        nameUpper === "BUNNY"
      );
      const isKnownBoss = (
        nameUpper.includes("BROLY") ||
        nameUpper.includes("SUPER") ||
        nameUpper.includes("BOSS") ||
        nameUpper.includes("KUKU") ||
        nameUpper.includes("RAMBO") ||
        nameUpper.includes("MAP DAU DINH") ||
        nameUpper.includes("FIDE") ||
        nameUpper.includes("TAMBORINE") ||
        nameUpper.includes("AKKUMAN") ||
        nameUpper.includes("DRUM") ||
        nameUpper.includes("TIEU DOI TRUONG") ||
        nameUpper.includes("BLACK GOKU") ||
        nameUpper.includes("XEN BO HUNG")
      );
      const isBoss = !isPetOrDisciple && (cTypePk === 5 || isKnownBoss || (charID <= -1000)) && charHP > 0;
      const charObj = { ptr: cPtr, charID, name: cName || "Nhân vật", hp: charHP, maxHp: charHPFull, x: charX, y: charY, cTypePk, isBoss };
      charsInMap.push(charObj);
      if (isBoss) {
        bossDetected = charObj;
      }
    }

    // Đọc chi tiết Nhiệm vụ đang làm trong RAM (Char.taskMaint tại myCharPtr + 500)
    // Offset chuẩn xác đã kiểm chứng trên ảnh thực tế:
    // +8: index (int32), +12: taskId (int16), +16: max (short[]), +20: counts (short[]),
    // +24: names (string[]), +28: details (string[]), +32: subNames (string[]), +36: contentInfo (string[]), +40: count (int16)
    let taskMaint = null;
    const taskPtr = HEAPU32[(myCharPtr + 500) >> 2];
    if (taskPtr && taskPtr < wasmBuffer.byteLength) {
      const index = HEAP32[(taskPtr + 8) >> 2];
      const taskId = HEAP16[(taskPtr + 12) >> 1];
      const maxArrPtr = HEAPU32[(taskPtr + 16) >> 2];
      const countsArrPtr = HEAPU32[(taskPtr + 20) >> 2];
      const names = readIl2CppStringArray(HEAPU32[(taskPtr + 24) >> 2]);
      const details = readIl2CppStringArray(HEAPU32[(taskPtr + 28) >> 2]);
      const subNames = readIl2CppStringArray(HEAPU32[(taskPtr + 32) >> 2]);
      const contentInfo = readIl2CppStringArray(HEAPU32[(taskPtr + 36) >> 2]);

      let curCount = 0;
      let maxCount = 0;

      if (countsArrPtr && countsArrPtr < wasmBuffer.byteLength && index >= 0 && index < 20) {
        const cVal = HEAP16[((countsArrPtr + 16) >> 1) + index];
        if (cVal >= 0 && cVal < 10000) curCount = cVal;
      }
      if (maxArrPtr && maxArrPtr < wasmBuffer.byteLength && index >= 0 && index < 20) {
        const mVal = HEAP16[((maxArrPtr + 16) >> 1) + index];
        if (mVal >= 0 && mVal < 10000) maxCount = mVal;
      }

      const rawStepName = (subNames[index] || "").replace(/^\s*-\s*/, "").trim();
      const activeDetail = details[index] || details[0] || "";
      const questTitle = names[0] || ("Nhiệm vụ #" + taskId);

      // Nếu chuỗi subNames[index] có dạng "(0/30)" thì ưu tiên lấy trực tiếp từ chuỗi hiển thị trên bảng nhiệm vụ
      const match = rawStepName.match(/\((\d+)\s*\/\s*(\d+)\)/);
      if (match) {
        curCount = parseInt(match[1], 10);
        maxCount = parseInt(match[2], 10);
      }
      const cleanStepName = rawStepName.replace(/\s*\(\d+\s*\/\s*\d+\)\s*$/, "").trim();

      taskMaint = {
        taskId,
        index,
        count: curCount,
        max: maxCount,
        questTitle,
        activeStepName: cleanStepName || rawStepName,
        rawStepName,
        activeDetail,
        subNames,
        details,
        contentInfo
      };
    }

    return {
      ptrs: {
        tileMapStatic,
        pickMobStatic,
        autoXmapStatic,
        xmapCtrlStatic,
        xmapDataStatic,
        charStatic,
        gameScrStatic,
        gameCanvasStatic,
        myCharPtr
      },
      mapId,
      mapName,
      zoneId,
      planetId,
      cx,
      cy,
      cgender,
      cHP,
      cHPFull,
      cMP,
      cMPFull,
      statusMe,
      isDie,
      isChangingMap,
      isInfoDlgShowing,
      tanSat,
      neSieuQuai,
      vuotDiaHinh,
      telePem,
      isGoBack,
      mapGoback,
      zoneGoback,
      isXmapRunning,
      xmapTargetId,
      mobs,
      aliveMobs,
      npcs,
      charsInMap,
      bossDetected,
      taskMaint
    };
  }

  // ============================================================================
  // 5. ĐIỀU KHIỂN TRỰC TIẾP TRONG RAM (TÀN SÁT, XMAP, BOSS, NPC, HỒI SINH, RỜI NHÀ)
  // ============================================================================
  // Gửi mã phím ASCII trực tiếp vào GameCanvas.keyAsciiPress (+536) chuẩn Fn 32922
  function pressAsciiKeyInRam(charCode) {
    const gameCanvasStatic = getStaticFieldsPtr(ADDR.GameCanvas_TypeInfo);
    if (!gameCanvasStatic) return false;
    HEAP32[(gameCanvasStatic + 536) >> 2] = charCode; // GameCanvas.keyAsciiPress
    return true;
  }

  // Bấm phím Enter / Center softkey (index 5, 15, 25 trong GameCanvas.keyPressed tại +60)
  function pressEnterCenterInRam() {
    const gameCanvasStatic = getStaticFieldsPtr(ADDR.GameCanvas_TypeInfo);
    if (!gameCanvasStatic) return false;
    const keyPressedPtr = HEAPU32[(gameCanvasStatic + 60) >> 2];
    if (keyPressedPtr && keyPressedPtr < wasmBuffer.byteLength) {
      HEAPU8[keyPressedPtr + 16 + 5] = 1;
      HEAPU8[keyPressedPtr + 16 + 15] = 1;
      HEAPU8[keyPressedPtr + 16 + 25] = 1;
    }
    return true;
  }

  // Bấm phím chọn nút Giữa (Enter / Kiệt sức / Xác nhận Menu) trực tiếp trong GameCanvas.keyPressed (+60)
  // Chuẩn Fn 32923 (mapKeyPress case -5) & Fn 21772 (GameScr.updateKey @1540..@1867)
  function triggerReviveOrConfirmInRam() {
    const gameCanvasStatic = getStaticFieldsPtr(ADDR.GameCanvas_TypeInfo);
    if (!gameCanvasStatic) return false;

    // 1. Nếu Menu "Về nhà / Hồi sinh tại chỗ" đang mở (GameCanvas.menu tại +196, showMenu tại +8):
    // Chọn mục 0 ("Về nhà") và bấm xác nhận
    const menuPtr = HEAPU32[(gameCanvasStatic + 196) >> 2];
    if (menuPtr && menuPtr < wasmBuffer.byteLength && HEAPU8[menuPtr + 8] === 1) {
      HEAP32[(menuPtr + 16) >> 2] = 0; // menuSelectedItem = 0 ("Về nhà")
    }

    // 2. Bật cờ nhấn phím Enter / Center softkey
    pressEnterCenterInRam();
    return true;
  }

  // Bật/Tắt chế độ Tự động khóa mục tiêu & Tấn công Trùm (Boss nhiệm vụ: Akkuman, Tamborine, Drum...)
  // Sử dụng ModFunc.gI().focusBoss (+161) và ModFunc.gI().autoAttack (+28) chuẩn Fn 20185 & Fn 20183
  function setBossAttackInRam(enable, state, bossNameHint) {
    const modFuncStatic = getStaticFieldsPtr(ADDR.ModFunc_TypeInfo);
    if (modFuncStatic) {
      const modFuncInstance = HEAPU32[(modFuncStatic + 0) >> 2];
      if (modFuncInstance && modFuncInstance < wasmBuffer.byteLength) {
        HEAPU8[modFuncInstance + 161] = enable ? 1 : 0; // focusBoss
        HEAPU8[modFuncInstance + 28] = enable ? 1 : 0;  // autoAttack
      }
    }

    if (!enable || !state) return false;

    const myCharPtr = state.ptrs.myCharPtr;
    const stepNormForBoss = normalizeText(bossNameHint || "");
    const BOSS_KEYS = ["akkuman", "tamborine", "drum", "tau pay pay", "kuku", "map dau dinh", "rambo", "fide", "android", "king kong", "xen bo hung", "tieu doi truong", "broly"];
    const hintKey = BOSS_KEYS.find(k => stepNormForBoss.includes(k)) || "";

    // Tìm đúng Boss của nhiệm vụ trong khu (khớp theo tên); chỉ khi bước không nêu tên boss mới lấy boss bất kỳ
    let targetChar = null;
    if (state.charsInMap && state.charsInMap.length > 0) {
      for (const ch of state.charsInMap) {
        if (ch.hp <= 0) continue;
        const chNorm = normalizeText(ch.name);
        if (hintKey ? chNorm.includes(hintKey) : ch.isBoss) {
          targetChar = ch;
          break;
        }
      }
    }

    if (targetChar && myCharPtr) {
      // Chỉ khóa mục tiêu (focus); việc áp sát do ModFunc.focusBoss/Tàn Sát của game xử lý
      HEAPU32[(myCharPtr + 568) >> 2] = 0;
      HEAPU32[(myCharPtr + 580) >> 2] = 0;
      HEAPU32[(myCharPtr + 584) >> 2] = targetChar.ptr;
      return true;
    }
    return false;
  }

  // Tự động tìm NPC trong Map, dịch chuyển tới cạnh NPC, mở Menu & bấm qua toàn bộ hội thoại báo cáo nhiệm vụ
  function autoTalkAndReportNpcInRam(state, stepText) {
    if (!state) return "Đang đợi dữ liệu RAM...";
    const gameCanvasStatic = state.ptrs.gameCanvasStatic;
    const myCharPtr = state.ptrs.myCharPtr;
    if (!gameCanvasStatic || !myCharPtr) return "Đang đợi GameCanvas...";

    // 1. Kiểm tra nếu đang hiện bong bóng hội thoại NPC (ChatPopup.currChatPopup +16 hoặc serverChatPopUp +20)
    const chatPopupStatic = getStaticFieldsPtr(ADDR.ChatPopup_TypeInfo);
    if (chatPopupStatic) {
      const currPopup = HEAPU32[(chatPopupStatic + 16) >> 2];
      const serverPopup = HEAPU32[(chatPopupStatic + 20) >> 2];
      if ((currPopup && currPopup < wasmBuffer.byteLength) || (serverPopup && serverPopup < wasmBuffer.byteLength)) {
        pressEnterCenterInRam();
        pressAsciiKeyInRam(32); // Space / Enter để qua nhanh từng dòng hội thoại NPC
        return "💬 Đang bấm qua hội thoại báo cáo NPC...";
      }
    }

    // 2. Kiểm tra nếu Menu lựa chọn của NPC đang mở (GameCanvas.menu tại +196, showMenu tại +8)
    const menuPtr = HEAPU32[(gameCanvasStatic + 196) >> 2];
    if (menuPtr && menuPtr < wasmBuffer.byteLength && HEAPU8[menuPtr + 8] === 1) {
      const menuItemsVec = HEAPU32[(menuPtr + 12) >> 2];
      const cmdPtrs = readMyVector(menuItemsVec);
      let bestIdx = 0;
      for (let i = 0; i < cmdPtrs.length; i++) {
        const caption = normalizeText(readIl2CppString(HEAPU32[(cmdPtrs[i] + 16) >> 2]));
        if (
          caption.includes("nhiem vu") ||
          caption.includes("bao cao") ||
          caption.includes("giao") ||
          caption.includes("nhan") ||
          caption.includes("bai su") ||
          caption.includes("hoc viec") ||
          caption.includes("truyen") ||
          caption.includes("dong y") ||
          caption.includes("tiep tuc") ||
          caption.includes("noi chuyen")
        ) {
          bestIdx = i;
          break;
        }
      }
      HEAP32[(menuPtr + 16) >> 2] = bestIdx; // menuSelectedItem = bestIdx
      pressEnterCenterInRam();
      return `📋 Đang chọn mục #${bestIdx + 1} trong Menu NPC...`;
    }

    // 3. Tìm NPC mục tiêu trong danh sách GameScr.vNpc của bản đồ hiện tại
    const stepNorm = normalizeText(stepText || "");
    let targetNpc = null;

    if (state.npcs && state.npcs.length > 0) {
      // 3a. Ưu tiên khớp tên NPC được nhắc trong bước nhiệm vụ
      for (const npc of state.npcs) {
        const nNorm = normalizeText(npc.name);
        if (nNorm && nNorm.length >= 3 && stepNorm.includes(nNorm)) {
          targetNpc = npc;
          break;
        }
      }
      // 3b. Nhiệm vụ Bái Sư / Giao truyện / Báo cáo Sư Phụ theo từng hành tinh:
      if (!targetNpc && (stepNorm.includes("su phu") || stepNorm.includes("bai su") || stepNorm.includes("giao truyen") || stepNorm.includes("truyen"))) {
        if (state.cgender === 1 || state.mapId === 13) {
          targetNpc = state.npcs.find(n => n.templateId === 14 || normalizeText(n.name).includes("guru") || normalizeText(n.name).includes("truong lao"));
        } else if (state.cgender === 2 || state.mapId === 20) {
          targetNpc = state.npcs.find(n => n.templateId === 15 || normalizeText(n.name).includes("vegeta"));
        } else {
          targetNpc = state.npcs.find(n => n.templateId === 13 || normalizeText(n.name).includes("quy lao") || normalizeText(n.name).includes("kame"));
        }
      }
      // 3c. Nếu đang ở Nhà (21, 22, 23): chọn Ông Gôhan (0) / Ông Moori (1) / Ông Paragus (2) (bỏ qua Cây Đậu Thần id=4)
      if (!targetNpc && (state.mapId === 21 || state.mapId === 22 || state.mapId === 23)) {
        targetNpc = state.npcs.find(n => n.templateId !== 4) || state.npcs[0];
      }
      // 3d. Nếu ở Đảo Kamê (5) ưu tiên Quy Lão (13), Đảo Guru (13) ưu tiên Trưởng lão Guru (14), Vách núi đen (20) ưu tiên Vua Vegeta (15), Rừng Karin (47) ưu tiên Bò Mộng (47)
      if (!targetNpc) {
        if (state.mapId === 5) targetNpc = state.npcs.find(n => n.templateId === 13 || normalizeText(n.name).includes("quy lao") || normalizeText(n.name).includes("kame"));
        else if (state.mapId === 13) targetNpc = state.npcs.find(n => n.templateId === 14 || normalizeText(n.name).includes("guru") || normalizeText(n.name).includes("truong lao"));
        else if (state.mapId === 20) targetNpc = state.npcs.find(n => n.templateId === 15 || normalizeText(n.name).includes("vegeta"));
        else if (state.mapId === 47) targetNpc = state.npcs.find(n => n.templateId === 47 || normalizeText(n.name).includes("bo mong"));
      }
      // 3e. Dự phòng: chọn NPC đầu tiên không phải Cây Đậu Thần
      if (!targetNpc) {
        targetNpc = state.npcs.find(n => n.templateId !== 4) || state.npcs[0];
      }
    }

    if (!targetNpc) {
      return "🔍 Đang tìm NPC trong bản đồ...";
    }

    // 4. Dịch chuyển nhân vật tới sát vị trí NPC, gán Char.npcFocus (+580) và nhấn Enter để mở hội thoại/menu
    const dist = Math.hypot(targetNpc.x - state.cx, targetNpc.y - state.cy);
    if (dist > 36 && targetNpc.x > 0 && targetNpc.y > 0) {
      HEAP32[(myCharPtr + 80) >> 2] = targetNpc.x;
      HEAP32[(myCharPtr + 84) >> 2] = targetNpc.y;
    }

    HEAPU32[(myCharPtr + 568) >> 2] = 0;             // Xóa mobFocus
    HEAPU32[(myCharPtr + 584) >> 2] = 0;             // Xóa charFocus
    HEAPU32[(myCharPtr + 580) >> 2] = targetNpc.ptr; // Gán npcFocus = targetNpc

    pressEnterCenterInRam();
    pressAsciiKeyInRam(13);
    return `🗣️ Đang tự động báo cáo với NPC ${targetNpc.name || ("#" + targetNpc.templateId)}...`;
  }

  // ============================================================================
  // HỆ THỐNG DI CHUYỂN LIÊN HÀNH TINH QUA TRẠM TÀU VŨ TRỤ (INTER-PLANET TRANSIT)
  // ============================================================================
  const PLANET_SPACESHIP_MAPS = {
    0: 24, // Trạm tàu vũ trụ Trái Đất (Map 24)
    1: 25, // Trạm tàu vũ trụ Namếc (Map 25)
    2: 26  // Trạm tàu vũ trụ Xayda (Map 26)
  };

  const PLANET_NAMES = {
    0: "Trái Đất",
    1: "Namếc",
    2: "Xayda"
  };

  function getPlanetOfMap(mapId) {
    if ([0, 1, 2, 3, 4, 5, 6, 21, 24, 27, 28, 29, 30, 42, 45, 46, 47, 52].includes(mapId)) return 0;
    if ([7, 8, 9, 10, 11, 12, 13, 22, 25, 31, 32, 33, 34, 43].includes(mapId)) return 1;
    if ([14, 15, 16, 17, 18, 19, 20, 23, 26, 35, 36, 37, 38, 44, 64, 65, 68].includes(mapId)) return 2;
    return -1;
  }

  // Tự động tương tác với NPC Tàu Vũ Trụ tại Trạm tàu (Map 24, 25, 26) để bay sang hành tinh đích
  function autoUseSpaceshipToPlanetInRam(state, targetPlanet) {
    if (!state) return "Đang đợi RAM...";
    const gameCanvasStatic = state.ptrs.gameCanvasStatic;
    const myCharPtr = state.ptrs.myCharPtr;
    if (!gameCanvasStatic || !myCharPtr) return "Đang đợi GameCanvas...";

    // 0. (Đã chuyển ESC xuống sau khi kiểm tra popup/menu để không tự đóng menu chọn hành tinh)
    const keyPressedPtr = HEAPU32[(gameCanvasStatic + 60) >> 2];

    // 1. Kiểm tra nếu ChatPopup đang hiện (bấm qua)
    const chatPopupStatic = getStaticFieldsPtr(ADDR.ChatPopup_TypeInfo);
    if (chatPopupStatic) {
      const currPopup = HEAPU32[(chatPopupStatic + 16) >> 2];
      const serverPopup = HEAPU32[(chatPopupStatic + 20) >> 2];
      if ((currPopup && currPopup < wasmBuffer.byteLength) || (serverPopup && serverPopup < wasmBuffer.byteLength)) {
        pressEnterCenterInRam();
        pressAsciiKeyInRam(32);
        return "💬 Đang bấm qua hội thoại Tàu vũ trụ...";
      }
    }

    // 2. Kiểm tra nếu Menu chọn hành tinh đang mở (GameCanvas.menu tại +196)
    const menuPtr = HEAPU32[(gameCanvasStatic + 196) >> 2];
    if (menuPtr && menuPtr < wasmBuffer.byteLength && HEAPU8[menuPtr + 8] === 1) {
      const menuItemsVec = HEAPU32[(menuPtr + 12) >> 2];
      const cmdPtrs = readMyVector(menuItemsVec);
      let bestIdx = -1;
      const pKeywords = {
        0: ["trai dat", "earth"],
        1: ["namec", "namek", "nam ec", "guru"],
        2: ["xayda", "saiyan", "vegeta"]
      }[targetPlanet] || [];

      for (let i = 0; i < cmdPtrs.length; i++) {
        const caption = normalizeText(readIl2CppString(HEAPU32[(cmdPtrs[i] + 16) >> 2]));
        if (pKeywords.some(kw => caption.includes(kw))) {
          bestIdx = i;
          break;
        }
      }
      if (bestIdx >= 0) {
        HEAP32[(menuPtr + 16) >> 2] = bestIdx;
        pressEnterCenterInRam();
        return `🚀 Đang chọn bay sang ${PLANET_NAMES[targetPlanet]} (Mục #${bestIdx + 1})...`;
      }
    }

    // 3. Tìm NPC Tàu vũ trụ (TUYỆT ĐỐI LOẠI BỎ URON VÀ CÂY ĐẬU THẦN)
    let targetNpc = null;
    if (state.npcs && state.npcs.length > 0) {
      // Loại trừ hoàn toàn Uron (bán sách/bùa) và Cây Đậu Thần
      const candidates = state.npcs.filter(n => {
        const nNorm = normalizeText(n.name || "");
        return !nNorm.includes("uron") && !nNorm.includes("dau") && n.templateId !== 4;
      });

      // 3a. Ưu tiên NPC có tên chứa tàu / phi thuyền / brief / cargo / cui / trạm
      targetNpc = candidates.find(n => {
        const nNorm = normalizeText(n.name || "");
        return (
          nNorm.includes("tau") ||
          nNorm.includes("phi thuyen") ||
          nNorm.includes("brief") ||
          nNorm.includes("cargo") ||
          nNorm.includes("cui") ||
          nNorm.includes("tram")
        );
      });

      // 3b. Nếu không khớp tên từ khóa, chọn NPC nằm ở vị trí chiếc tàu vũ trụ (x >= 450)
      if (!targetNpc) {
        targetNpc = candidates.find(n => n.x >= 450) || candidates[0];
      }
    }

    if (!targetNpc) {
      return `🔍 Đang tìm Tàu vũ trụ tại ${state.mapName}...`;
    }

    // 4. Dịch chuyển nhân vật tới sát vị trí Tàu vũ trụ (tránh xa vị trí Uron x=390), gán npcFocus và nhấn Enter
    const dist = Math.hypot(targetNpc.x - state.cx, targetNpc.y - state.cy);
    if (dist > 36 && targetNpc.x > 0 && targetNpc.y > 0) {
      HEAP32[(myCharPtr + 80) >> 2] = targetNpc.x;
      HEAP32[(myCharPtr + 84) >> 2] = targetNpc.y;
    }

    HEAPU32[(myCharPtr + 568) >> 2] = 0;             // Xóa mobFocus
    HEAPU32[(myCharPtr + 584) >> 2] = 0;             // Xóa charFocus
    HEAPU32[(myCharPtr + 580) >> 2] = targetNpc.ptr; // Gán npcFocus = Tàu vũ trụ

    pressEnterCenterInRam();
    pressAsciiKeyInRam(13);
    return `🚀 Đang mở hội thoại Tàu vũ trụ [${targetNpc.name || ("#" + targetNpc.templateId)}] để sang ${PLANET_NAMES[targetPlanet]}...`;
  }

  // Tự động ăn Đậu thần trực tiếp trong RAM (kích hoạt GameScr.doUseHP() qua keyPressed[10] tại Fn 21772 @15428)
  function useBeanInRam() {
    const gameCanvasStatic = getStaticFieldsPtr(ADDR.GameCanvas_TypeInfo);
    if (!gameCanvasStatic) return false;
    const keyPressedPtr = HEAPU32[(gameCanvasStatic + 60) >> 2];
    if (keyPressedPtr && keyPressedPtr < wasmBuffer.byteLength) {
      HEAPU8[keyPressedPtr + 16 + 10] = 1; // keyPressed[10] = true -> GameScr.gI().doUseHP()
    }
    return true;
  }

  // Tự động rời khỏi Nhà (Map 21, 22, 23) ra Làng (Map 0, 7, 14) bằng ManualXmap.LoadMapLeft ('j' = 106)
  // kết hợp dịch chuyển nhân vật ra cửa nhà (x = 35, y = 336)
  function forceExitHouseInRam(myCharPtr) {
    if (myCharPtr && myCharPtr < wasmBuffer.byteLength) {
      const cx = HEAP32[(myCharPtr + 80) >> 2];
      if (cx > 60) {
        HEAP32[(myCharPtr + 80) >> 2] = 35;  // Đặt tọa độ X ngay cửa trái của nhà
        HEAP32[(myCharPtr + 84) >> 2] = 336; // Đặt tọa độ Y mặt đất nhà
      }
    }
    // Gửi phím 'j' (106) vào GameCanvas.keyAsciiPress (+536) để gọi ManualXmap.LoadMapLeft()
    pressAsciiKeyInRam(106);
  }

  function setTanSatInRam(enable, options = {}) {
    const pickMobStatic = getStaticFieldsPtr(ADDR.PickMob_TypeInfo);
    if (!pickMobStatic) return false;

    HEAPU8[pickMobStatic + 8] = enable ? 1 : 0; // PickMob.tanSat
    if (options.neSieuQuai !== undefined) {
      HEAPU8[pickMobStatic + 10] = options.neSieuQuai ? 1 : 0;
    }
    if (options.vuotDiaHinh !== undefined) {
      HEAPU8[pickMobStatic + 11] = options.vuotDiaHinh ? 1 : 0;
    }
    if (options.telePem !== undefined) {
      HEAPU8[pickMobStatic + 12] = options.telePem ? 1 : 0;
    }
    if (options.autoPick !== undefined) {
      HEAPU8[pickMobStatic + 44] = options.autoPick ? 1 : 0; // IsAutoPickItems
      HEAPU8[pickMobStatic + 45] = options.autoPick ? 1 : 0; // IsPickItemsAll (nhặt tất cả vật phẩm nhiệm vụ như Truyện tranh)
      HEAPU8[pickMobStatic + 46] = options.autoPick ? 1 : 0; // IsPickItemsDis (nhặt xa)
    }
    // Giữ nguyên bộ lọc quái (IdMobsTanSat/TypeMobsTanSat) do người dùng cấu hình
    if (enable) {
      if (HEAP32[(pickMobStatic + 68) >> 2] <= 0) HEAP32[(pickMobStatic + 68) >> 2] = 50; // hpBuff = 50%
      if (HEAP32[(pickMobStatic + 72) >> 2] <= 0) HEAP32[(pickMobStatic + 72) >> 2] = 50; // mpBuff = 50%
    }
    return true;
  }

  function setGobackInRam(enable, mapId, zoneId, x, y) {
    const pickMobStatic = getStaticFieldsPtr(ADDR.PickMob_TypeInfo);
    if (!pickMobStatic) return false;

    HEAPU8[pickMobStatic + 13] = enable ? 1 : 0; // PickMob.isGoBack
    if (mapId !== undefined && mapId >= 0) {
      HEAP32[(pickMobStatic + 16) >> 2] = mapId;
    }
    if (zoneId !== undefined && zoneId >= 0) {
      HEAP32[(pickMobStatic + 20) >> 2] = zoneId;
    }
    if (x !== undefined && x >= 0) {
      HEAP32[(pickMobStatic + 24) >> 2] = x;
    }
    if (y !== undefined && y >= 0) {
      HEAP32[(pickMobStatic + 28) >> 2] = y;
    }
    return true;
  }

  // Tự động yêu cầu đổi sang Khu vực khác (tránh Boss/Super Broly) trong RAM
  function requestChangeZoneInRam(nextZoneId) {
    const pickMobStatic = getStaticFieldsPtr(ADDR.PickMob_TypeInfo);
    const tileMapStatic = getStaticFieldsPtr(ADDR.TileMap_TypeInfo);
    if (pickMobStatic && tileMapStatic) {
      const currMap = HEAP32[(tileMapStatic + 124) >> 2];
      HEAPU8[pickMobStatic + 13] = 1;                  // isGoBack = true
      HEAP32[(pickMobStatic + 16) >> 2] = currMap;    // mapGoback = current map
      HEAP32[(pickMobStatic + 20) >> 2] = nextZoneId; // zoneGoback = nextZoneId
    }
    // Gửi phím 'm' (109) để kích hoạt chuyển khu (chỉ ghi 1 phím: keyAsciiPress là biến đơn)
    pressAsciiKeyInRam(109);
    return true;
  }

  function startXmapInRam(targetMapId, currentMapId) {
    // 1. Mở khóa ModFunc.gI().canUpdate = 1 để GameScr.update() chạy AutoXmap.Update()!
    ensureModFuncCanUpdate();

    const autoXmapStatic = getStaticFieldsPtr(ADDR.AutoXmap_TypeInfo);
    if (!autoXmapStatic) return false;

    // 2. Tắt Tàn Sát ngay lập tức trước khi di chuyển
    setTanSatInRam(false);

    // 3. Nếu đang ở trong Nhà (Map 21, 22, 23), tắt dùng Capsule trong AutoXmap (+3, +4)
    // vì trong Nhà server không cho dùng Capsule khiến XmapData.Load() bị treo chờ bảng Capsule!
    if (currentMapId === 21 || currentMapId === 22 || currentMapId === 23) {
      HEAPU8[autoXmapStatic + 3] = 0; // IsUseCapsuleNormal = false
      HEAPU8[autoXmapStatic + 4] = 0; // IsUseCapsuleVip = false
    }

    // Giải phóng cờ kẹt IsWaitInfoMapTrans (+25) của XmapData nếu trước đó bị kẹt
    const xmapDataStatic = getStaticFieldsPtr(ADDR.XmapData_TypeInfo);
    if (xmapDataStatic) {
      const xmapDataInstance = HEAPU32[(xmapDataStatic + 0) >> 2];
      if (xmapDataInstance && xmapDataInstance < wasmBuffer.byteLength) {
        if (HEAPU8[xmapDataInstance + 25] === 1) {
          HEAPU8[xmapDataInstance + 25] = 0; // IsWaitInfoMapTrans = false
          HEAPU8[xmapDataInstance + 24] = 0; // IsLoading = false
        }
      }
    }

    const xmapCtrlStatic = getStaticFieldsPtr(ADDR.XmapController_TypeInfo);
    if (!xmapCtrlStatic) {
      // Kích hoạt AutoXmap.IsXmapRunning = 1 để Fn 22060 gọi il2cpp_runtime_class_init(XmapController)
      HEAPU8[autoXmapStatic + 0] = 1;
      return true;
    }

    // 4. Đặt lại toàn bộ trạng thái đường đi của XmapController (chuẩn Fn 22074 + Fn 22083)
    HEAP32[(xmapCtrlStatic + 20) >> 2] = targetMapId; // IdMapEnd = targetMapId
    HEAP32[(xmapCtrlStatic + 24) >> 2] = 0;           // WayXmap = null (bắt buộc tính lại lộ trình!)
    HEAP32[(xmapCtrlStatic + 28) >> 2] = 0;           // IndexWay = 0
    HEAPU8[xmapCtrlStatic + 32] = 0;                  // IsNextMapFailed = false
    HEAPU8[xmapCtrlStatic + 33] = 0;                  // IsWait = false
    HEAPU8[xmapCtrlStatic + 56] = 0;                  // IsWaitNextMap = false

    // 5. Bật cờ chạy Xmap
    HEAPU8[autoXmapStatic + 0] = 1;                   // AutoXmap.IsXmapRunning = true
    return true;
  }

  function stopXmapInRam() {
    const autoXmapStatic = getStaticFieldsPtr(ADDR.AutoXmap_TypeInfo);
    const xmapCtrlStatic = getStaticFieldsPtr(ADDR.XmapController_TypeInfo);
    if (autoXmapStatic) {
      HEAPU8[autoXmapStatic + 0] = 0;
    }
    if (xmapCtrlStatic) {
      HEAP32[(xmapCtrlStatic + 24) >> 2] = 0;
    }
    return true;
  }

  // ============================================================================
  // 6. BỘ MÁY TRẠNG THÁI (STATE MACHINE) LÀM NHIỆM VỤ CHÍNH XÁC 100%
  // ============================================================================
  const bot = {
    running: false,
    presetKey: "auto_ram_quest",
    stageIndex: 0,
    stageKilledCount: 0,
    totalKilledCount: 0,
    statusText: "Sẵn sàng! Bấm BẮT ĐẦU AUTO để tự động kiểm tra nhiệm vụ & chạy.",
    lastXmapTriggerTime: 0,
    lastXmapTargetId: -1,
    lastMapId: -1,
    lastTaskStepIndex: -1,
    lastSpaceshipTime: 0,
    lastZoneChangeTime: 0,
    mobTracker: new Map(),
    lastFocusedMobId: -1,
    options: {
      neSieuQuai: true,
      vuotDiaHinh: true,
      telePem: false,
      autoPick: true,
      autoGoback: true,
      avoidBoss: true
    }
  };

  function resolveStageMapId(stage, state) {
    if (stage.mapId === "HOME") {
      return 21 + (state.cgender || 0);
    }
    if (stage.mapId === "MASTER") {
      if (state.cgender === 1) return 13; // Sư phụ Namếc: Trưởng Lão Guru (Đảo Guru - Map 13)
      if (state.cgender === 2) return 20; // Sư phụ Xayda: Vua Vegeta (Vách núi đen - Map 20)
      return 5;                           // Sư phụ Trái Đất: Quy Lão Kamê (Đảo Kamê - Map 5)
    }
    if (stage.mapId === "COMIC_MOB") {
      if (state.cgender === 1) return 31; // Namếc: Ốc sên (Núi hoa vàng - Map 31)
      if (state.cgender === 2) return 20; // Xayda: Quỷ đầu nhọn (Vách núi đen - Map 20)
      return 5;                           // Trái Đất: Ốc mượn hồn (Đảo Kamê - Map 5)
    }
    return Number(stage.mapId);
  }

  function resetStageTracking() {
    bot.stageKilledCount = 0;
    bot.mobTracker.clear();
    bot.lastFocusedMobId = -1;
  }

  function updateKillCounterFromRamMobs(state, targetMapId) {
    if (state.mapId !== targetMapId || state.isChangingMap || state.isInfoDlgShowing) {
      bot.mobTracker.clear();
      return;
    }

    if (bot.lastMapId !== state.mapId) {
      bot.mobTracker.clear();
      bot.lastMapId = state.mapId;
    }

    for (const m of state.mobs) {
      if (m.isFocused) {
        bot.lastFocusedMobId = m.mobId;
      }
    }

    for (const m of state.mobs) {
      const prev = bot.mobTracker.get(m.mobId);
      const dist = Math.hypot(m.x - state.cx, m.y - state.cy);
      const wasNearOrFocused =
        m.isFocused ||
        m.mobId === bot.lastFocusedMobId ||
        (state.tanSat && dist < 240) ||
        (prev && prev.wasTargeted);

      if (prev && prev.alive && !m.alive && prev.wasTargeted) {
        bot.stageKilledCount++;
        bot.totalKilledCount++;
        console.log(
          `[NRO Deep Bot] Đã hạ quái #${m.mobId} (${getMobTemplateName(m.templateId)}) -> Đếm: ${bot.stageKilledCount}`
        );
      }

      bot.mobTracker.set(m.mobId, {
        alive: m.alive,
        hp: m.hp,
        wasTargeted: m.alive ? Boolean(wasNearOrFocused) : false
      });
    }
  }

  function getActiveTaskRequirement(state) {
    const preset = QUEST_PRESETS[bot.presetKey];

    // CHẾ ĐỘ 1: TỰ ĐỘNG 100% ĐỌC TỪ NHIỆM VỤ ĐANG LÀM TRONG RAM (Char.taskMaint)
    if (preset && preset.autoFromRam && state.taskMaint) {
      const tm = state.taskMaint;
      if (bot.lastTaskStepIndex !== tm.index) {
        bot.lastTaskStepIndex = tm.index;
        resetStageTracking();
      }

      const autoMapId = resolveQuestStepToMapId(tm.activeStepName, tm.activeDetail, state.cgender);
      if (autoMapId !== null) {
        const isNpc = isNpcReportStep(tm.activeStepName);
        const bossStep = !isNpc && isBossQuestStep(tm.activeStepName);
        const mobOrCollectStep = !isNpc && !bossStep && (tm.max > 0 || isMobKillOrCollectStep(tm.activeStepName));
        const npcStep = isNpc;
        const unsupported = !isNpc && !bossStep && !mobOrCollectStep;
        const isCollect = mobOrCollectStep && tm.max <= 0;
        const targetKills = isNpc ? 0 : (bossStep ? 1 : (tm.max > 0 ? tm.max : (mobOrCollectStep ? 1 : 0)));
        const currentKills = (isNpc || bossStep || isCollect) ? 0 : Math.max(tm.count, bot.stageKilledCount);
        return {
          isAutoRam: true,
          isBossStep: bossStep,
          isNpcStep: npcStep,
          isUnsupported: unsupported,
          isCollectStep: isCollect,
          stepName: tm.activeStepName || `Bước ${tm.index}`,
          mapId: autoMapId,
          targetKills,
          currentKills
        };
      }
      // Không xác định được Map cho bước này -> TUYỆT ĐỐI không chạy kịch bản khác, báo người dùng làm tay
      return {
        isAutoRam: true,
        isUnsupported: true,
        stepName: tm.activeStepName || `Bước ${tm.index}`,
        mapId: state.mapId,
        targetKills: 0,
        currentKills: 0
      };
    }
    if (preset && preset.autoFromRam) {
      return {
        isAutoRam: true,
        isUnsupported: true,
        stepName: "Đang đọc nhiệm vụ từ RAM...",
        mapId: state.mapId,
        targetKills: 0,
        currentKills: 0
      };
    }

    // CHẾ ĐỘ 2: CHẠY THEO KỊCH BẢN PRESET HOẶC TÙY CHỈNH
    const activePreset = (preset && !preset.autoFromRam) ? preset : QUEST_PRESETS["clan_quest_bulon"];

    // Đồng bộ tự động bước đang chạy với bảng Nhiệm vụ trong RAM (nếu nhiệm vụ trong RAM đang chỉ rõ quái/trùm chưa xong)
    if (state.taskMaint) {
      const stepNorm = normalizeText(state.taskMaint.activeStepName);
      for (let i = 0; i < activePreset.stages.length; i++) {
        const hint = activePreset.stages[i].mobNameHint;
        if (hint && stepNorm.includes(normalizeText(hint))) {
          if (bot.stageIndex !== i) {
            bot.stageIndex = i;
            resetStageTracking();
          }
          break;
        }
      }
    }

    if (bot.stageIndex >= activePreset.stages.length) {
      if (activePreset.loop) {
        bot.stageIndex = 0;
        resetStageTracking();
      } else {
        return { finished: true };
      }
    }

    const stage = activePreset.stages[bot.stageIndex];
    const targetMapId = resolveStageMapId(stage, state);
    const isNpc = Boolean(stage.isNpcStep) || isNpcReportStep(stage.name);
    const bossStep = !isNpc && (Boolean(stage.isBossStep) || isBossQuestStep(stage.name));
    const npcStep = isNpc || (!bossStep && (stage.targetKills || 0) <= 0);

    let currentKills = bot.stageKilledCount;
    let targetKills = stage.targetKills || (bossStep ? 1 : 0);
    if (state.taskMaint && state.taskMaint.max > 0 && stage.mobNameHint) {
      const stepNorm = normalizeText(state.taskMaint.activeStepName);
      const hintNorm = normalizeText(stage.mobNameHint);
      if (stepNorm.includes(hintNorm)) {
        targetKills = state.taskMaint.max;
        currentKills = state.taskMaint.count;
      }
    }

    return {
      isAutoRam: false,
      isBossStep: bossStep,
      isNpcStep: npcStep,
      stepName: stage.name,
      mapId: targetMapId,
      targetKills,
      currentKills
    };
  }

  function tickBot() {
    const state = readGameState();
    updateHUD(state);

    if (!state || !bot.running) return;

    const req = getActiveTaskRequirement(state);
    if (!req) return;

    if (req.finished) {
      bot.running = false;
      setTanSatInRam(false);
      setBossAttackInRam(false, state);
      stopXmapInRam();
      bot.statusText = "✅ Đã hoàn thành toàn bộ chuỗi nhiệm vụ!";
      return;
    }

    const targetMapId = req.mapId;
    const targetMapName = MAP_NAMES[targetMapId] || ("Map " + targetMapId);
    const now = Date.now();

    // 0a. BƯỚC CHƯA HỖ TRỢ (mua đồ, trang bị, sự kiện, boss chưa có map...) -> DỪNG AN TOÀN, KHÔNG ĐOÁN
    if (req.isUnsupported) {
      setTanSatInRam(false);
      setBossAttackInRam(false, state);
      stopXmapInRam();
      bot.statusText = `🛑 Bước "${req.stepName}" chưa được hỗ trợ tự động. Hãy làm tay bước này rồi bot sẽ tự chạy tiếp.`;
      return;
    }

    // 0b. GIỚI HẠN SỐ LẦN CHẾT: chết >= 5 lần trong 10 phút -> dừng hẳn (tránh chết vòng lặp khi hết đậu)
    if (state.isDie && !bot.wasDie) {
      bot.deathTimes = (bot.deathTimes || []).filter(t => now - t < 600000);
      bot.deathTimes.push(now);
      if (bot.deathTimes.length >= 5) {
        bot.running = false;
        setTanSatInRam(false);
        stopXmapInRam();
        bot.statusText = "🛑 Đã chết 5 lần trong 10 phút (có thể hết đậu/quá yếu). Bot dừng để bảo vệ nhân vật.";
        if (hudRefs && hudRefs.btnToggle) {
          hudRefs.btnToggle.textContent = "▶ BẮT ĐẦU AUTO";
          hudRefs.btnToggle.style.background = "#16a34a";
        }
        bot.wasDie = state.isDie;
        return;
      }
    }
    bot.wasDie = state.isDie;

    // 0c. XMAP KẸT: cùng một đích quá 90s mà vẫn chưa tới -> dừng & báo
    if (state.mapId !== targetMapId && state.mapId === bot.lastMapForStuck && bot.lastXmapTargetId === targetMapId) {
      if (!bot.stuckSince) bot.stuckSince = now;
      if (now - bot.stuckSince > 90000) {
        bot.running = false;
        stopXmapInRam();
        setTanSatInRam(false);
        bot.statusText = `🛑 Xmap không tới được ${targetMapName} sau 90s (map bị chặn/cần điều kiện). Hãy tự di chuyển rồi bấm lại.`;
        bot.stuckSince = 0;
        if (hudRefs && hudRefs.btnToggle) {
          hudRefs.btnToggle.textContent = "▶ BẮT ĐẦU AUTO";
          hudRefs.btnToggle.style.background = "#16a34a";
        }
        return;
      }
    } else {
      bot.stuckSince = 0;
    }
    bot.lastMapForStuck = state.mapId;

    // 1. KIỂM TRA NHÂN VẬT CHẾT -> TỰ ĐỘNG BẤM "KIỆT SỨC" & CHỌN "VỀ NHÀ" TRỰC TIẾP TRONG RAM
    if (state.isDie) {
      setTanSatInRam(false);
      setBossAttackInRam(false, state);
      stopXmapInRam();
      if (bot.options.autoGoback) {
        setGobackInRam(true, targetMapId, state.zoneId, state.cx, state.cy);
      }
      if (!bot.lastReviveTime || now - bot.lastReviveTime > 350) {
        triggerReviveOrConfirmInRam();
        bot.lastReviveTime = now;
      }
      bot.statusText = `💀 Nhân vật tử trận (HP: 0)! Đang tự bấm "Kiệt sức -> Về nhà" trong RAM để hồi phục & quay lại ${targetMapName}...`;
      return;
    }

    // 2. NẾU ĐANG CHUYỂN MAP HOẶC ĐANG TẢI BẢN ĐỒ -> ĐỢI TẢI XONG, TẮT TÀN SÁT
    if (state.isChangingMap || state.isInfoDlgShowing) {
      setTanSatInRam(false);
      setBossAttackInRam(false, state);
      bot.statusText = `⏳ Đang chuyển bản đồ (tới ${targetMapName})...`;
      return;
    }

    // 3. NẾU ĐANG Ở TRONG NHÀ (MAP 21, 22, 23) MÀ ĐÍCH ĐẾN Ở NGOÀI NHÀ: TỰ ĂN ĐẬU HỒI HP/KI VÀ TỰ RỜI KHỎI NHÀ
    const isInsideHouse = state.mapId === 21 || state.mapId === 22 || state.mapId === 23;
    if (isInsideHouse && targetMapId !== state.mapId) {
      setTanSatInRam(false);
      setBossAttackInRam(false, state);

      // 3a. Nếu vừa hồi sinh về nhà mà HP hoặc KI dưới 75%, tự động ăn Đậu thần trước khi đi
      if (state.cHPFull > 0 && (state.cHP < state.cHPFull * 0.75 || state.cMP < state.cMPFull * 0.75)) {
        if (!bot.lastBeanTime || now - bot.lastBeanTime > 450) {
          useBeanInRam();
          triggerReviveOrConfirmInRam(); // Thu hoạch / ăn đậu từ Cây Đậu Thần nếu đang đứng cạnh
          bot.lastBeanTime = now;
        }
        bot.statusText = `🌱 Đang ở ${state.mapName}: Tự ăn Đậu thần hồi phục HP (${state.cHP}/${state.cHPFull}) trước khi đi ${targetMapName}...`;
        // Không kẹt quá 2.5s nếu hết đậu trong hành trang
        if (!bot.houseEnterTime) bot.houseEnterTime = now;
        if (now - bot.houseEnterTime < 2500) {
          return;
        }
      } else {
        bot.houseEnterTime = 0;
      }

      // 3b. Tự động bước ra khỏi cửa nhà (Map 21->0, 22->7, 23->14) bằng LoadMapLeft ('j' = 106) + dịch chuyển tới cửa (x=35)
      if (!bot.lastHouseExitTime || now - bot.lastHouseExitTime > 450) {
        forceExitHouseInRam(state.ptrs.myCharPtr);
        startXmapInRam(targetMapId, state.mapId);
        bot.lastHouseExitTime = now;
        bot.lastXmapTriggerTime = now;
        bot.lastXmapTargetId = targetMapId;
      }
      bot.statusText = `🚪 Đang tự động rời khỏi ${state.mapName} (${state.mapId}) để Xmap tới ${targetMapName} (${targetMapId})...`;
      return;
    }
    bot.houseEnterTime = 0;

    // 4. KIỂM TRA ĐÃ ĐẾN ĐÚNG MAP CHỈ ĐỊNH CHƯA (100% THEO TileMap.mapID TRONG RAM)
    if (state.mapId !== targetMapId) {
      if (state.tanSat) {
        setTanSatInRam(false);
      }
      setBossAttackInRam(false, state);

      // 4a. KIỂM TRA ĐIỀU HƯỚNG LIÊN HÀNH TINH (Trái Đất 0, Namếc 1, Xayda 2)
      const currPlanet = getPlanetOfMap(state.mapId);
      const targetPlanet = getPlanetOfMap(targetMapId);
      const isDifferentPlanet = currPlanet !== -1 && targetPlanet !== -1 && currPlanet !== targetPlanet;

      if (isDifferentPlanet) {
        const stationMapId = PLANET_SPACESHIP_MAPS[currPlanet];
        // Nếu chưa tới Trạm tàu vũ trụ của hành tinh hiện tại -> Xmap tới Trạm tàu vũ trụ
        if (state.mapId !== stationMapId) {
          const needRetriggerStation =
            !state.isXmapRunning ||
            bot.lastXmapTargetId !== stationMapId;

          if (needRetriggerStation && (now - bot.lastXmapTriggerTime > 400)) {
            startXmapInRam(stationMapId, state.mapId);
            bot.lastXmapTriggerTime = now;
            bot.lastXmapTargetId = stationMapId;
          }
          bot.statusText = `🚀 Đang Xmap tới ${MAP_NAMES[stationMapId] || ("Map " + stationMapId)} để bay sang ${PLANET_NAMES[targetPlanet]} [${req.stepName}]`;
          return;
        }

        // Đã tới Trạm tàu vũ trụ! Dừng Xmap và tương tác với Tàu vũ trụ để bay sang hành tinh đích
        if (state.isXmapRunning) {
          stopXmapInRam();
        }
        if (!bot.lastSpaceshipTime || now - bot.lastSpaceshipTime > 380) {
          bot.statusText = autoUseSpaceshipToPlanetInRam(state, targetPlanet);
          bot.lastSpaceshipTime = now;
        }
        return;
      }

      // 4b. CÙNG HÀNH TINH: XMAP TRỰC TIẾP TỚI MAP ĐÍCH
      const xmapCtrlReady = state.ptrs.xmapCtrlStatic !== 0;
      const needRetrigger =
        !state.isXmapRunning ||
        !xmapCtrlReady ||
        state.xmapTargetId !== targetMapId ||
        bot.lastXmapTargetId !== targetMapId;

      if (needRetrigger && (now - bot.lastXmapTriggerTime > 400)) {
        startXmapInRam(targetMapId, state.mapId);
        bot.lastXmapTriggerTime = now;
        bot.lastXmapTargetId = targetMapId;
      }

      bot.statusText = `🚀 Đang Xmap tự động: ${state.mapName} (${state.mapId}) ➔ ${targetMapName} (${targetMapId}) [${req.stepName}]`;
      return;
    }

    // 5. ĐÃ ĐẾN ĐÚNG MAP MỤC TIÊU! DỪNG XMAP NẾU CÒN BẬT
    if (state.isXmapRunning) {
      stopXmapInRam();
    }

    // Tự động ăn đậu nếu HP hoặc KI tụt dưới 45% khi đang đánh quái/trùm
    if (state.cHPFull > 0 && (state.cHP < state.cHPFull * 0.45 || state.cMP < state.cMPFull * 0.45)) {
      if (!bot.lastBeanTime || now - bot.lastBeanTime > 600) {
        useBeanInRam();
        bot.lastBeanTime = now;
      }
    }

    // 6. XỬ LÝ BƯỚC BÁO CÁO / NÓI CHUYỆN VỚI NPC TỰ ĐỘNG TRONG RAM
    if (req.isNpcStep) {
      setTanSatInRam(false);
      setBossAttackInRam(false, state);
      // Preset: sau ~8s hội thoại tại NPC thì coi như đã báo cáo xong -> sang bước kế (RAM-mode tự đổi theo nhiệm vụ)
      if (!req.isAutoRam) {
        if (bot.npcStepKey !== bot.stageIndex) {
          bot.npcStepKey = bot.stageIndex;
          bot.npcStepSince = now;
        }
        if (now - bot.npcStepSince > 8000) {
          bot.npcStepKey = -1;
          bot.stageIndex++;
          resetStageTracking();
          bot.statusText = "✅ Đã báo cáo NPC xong, chuyển bước kế...";
          return;
        }
      }
      if (!bot.lastNpcTalkTime || now - bot.lastNpcTalkTime > 380) {
        bot.statusText = autoTalkAndReportNpcInRam(state, req.stepName);
        bot.lastNpcTalkTime = now;
      }
      return;
    }

    // 7. XỬ LÝ NHIỆM VỤ TIÊU DIỆT TRÙM (BOSS: AKKUMAN / TAMBORINE / DRUM / TÀU PẢY PẢY / KUKU...)
    if (req.isBossStep) {
      if (bot.options.autoGoback) {
        setGobackInRam(true, targetMapId, state.zoneId, state.cx, state.cy);
      }
      const hasBossChar = setBossAttackInRam(true, state, req.stepName);
      // Preset: đã thấy boss rồi và boss biến mất (đã hạ) -> sang bước kế
      if (!req.isAutoRam) {
        if (hasBossChar) bot.bossSeenKey = bot.stageIndex;
        else if (bot.bossSeenKey === bot.stageIndex) {
          bot.bossSeenKey = -1;
          setBossAttackInRam(false, state);
          bot.stageIndex++;
          resetStageTracking();
          bot.statusText = "✅ Đã hạ Trùm, chuyển bước kế...";
          return;
        }
      }
      // Bật thêm Tàn Sát để đánh cả trường hợp Trùm là Mob hoặc hỗ trợ dọn quái quanh Trùm
      if (!state.tanSat) {
        setTanSatInRam(true, {
          neSieuQuai: false,
          vuotDiaHinh: bot.options.vuotDiaHinh,
          telePem: bot.options.telePem,
          autoPick: bot.options.autoPick
        });
      }
      bot.statusText = hasBossChar
        ? `👑 Đang khóa mục tiêu & tiêu diệt Trùm [${req.stepName}] tại ${targetMapName} (Khu ${state.zoneId})!`
        : `👑 Đang săn Trùm [${req.stepName}] tại ${targetMapName} (Khu ${state.zoneId})...`;
      return;
    }

    // Tắt chế độ focusBoss khi làm nhiệm vụ đánh quái thường
    setBossAttackInRam(false, state);

    // 8. KIỂM TRA BOSS TRONG KHU (NẾU BẬT NÉ BOSS KHI ĐÁNH QUÁI THƯỜNG) -> TỰ ĐỘNG ĐỔI KHU
    if (bot.options.avoidBoss && state.bossDetected && now > (bot.ignoreBossUntil || 0)) {
      setTanSatInRam(false);
      if (bot.zoneTryFrom !== state.zoneId) {
        bot.zoneTryFrom = state.zoneId;
        bot.zoneTries = 0;
      }
      // Đã thử đổi khu 3 lần mà vẫn đứng nguyên (cơ chế đổi khu không hiệu lực) -> bỏ qua boss 60s & tiếp tục đánh
      if (bot.zoneTries >= 3) {
        bot.ignoreBossUntil = now + 60000;
        bot.zoneTries = 0;
        bot.statusText = `⚠️ Không đổi được khu khỏi ${state.bossDetected.name}. Bỏ qua né Boss 60s, hãy tự đổi khu nếu cần.`;
      } else {
        const currentZone = (state.zoneId >= 0 && state.zoneId < 30) ? state.zoneId : 0;
        const nextZoneId = (currentZone + 1) % 15;
        if (!bot.lastZoneChangeTime || now - bot.lastZoneChangeTime > 3000) {
          if (bot.options.autoGoback) {
            setGobackInRam(true, targetMapId, nextZoneId, state.cx, state.cy);
          }
          requestChangeZoneInRam(nextZoneId);
          bot.lastZoneChangeTime = now;
          bot.zoneTries++;
        }
        bot.statusText = `⚠️ Phát hiện ${state.bossDetected.name} trong Khu ${state.zoneId}! Đang đổi sang Khu ${nextZoneId} (lần ${bot.zoneTries}/3)...`;
        return;
      }
    }

    // 9. CẬP NHẬT BỘ ĐẾM QUÁI TRỰC TIẾP TỪ RAM
    updateKillCounterFromRamMobs(state, targetMapId);

    const updatedReq = getActiveTaskRequirement(state);
    if (!updatedReq.isAutoRam && updatedReq.currentKills >= updatedReq.targetKills) {
      setTanSatInRam(false);
      bot.statusText = `🎯 Hoàn thành ${updatedReq.currentKills}/${updatedReq.targetKills} quái tại ${targetMapName}! Chuyển sang bước kế tiếp...`;
      bot.stageIndex++;
      resetStageTracking();
      return;
    }

    // 10. BẬT TÀN SÁT & CẤU HÌNH GOBACK TRỰC TIẾP TRONG RAM
    if (bot.options.autoGoback) {
      setGobackInRam(true, targetMapId, state.zoneId, state.cx, state.cy);
    }

    if (!state.tanSat) {
      setTanSatInRam(true, {
        neSieuQuai: bot.options.neSieuQuai,
        vuotDiaHinh: bot.options.vuotDiaHinh,
        telePem: bot.options.telePem,
        autoPick: bot.options.autoPick
      });
    }

    bot.statusText = `⚔️ [${updatedReq.stepName}] Đang đánh tại ${targetMapName} (Khu ${state.zoneId})${updatedReq.isCollectStep ? ' [Săn nhặt vật phẩm]' : `: ${updatedReq.currentKills}/${updatedReq.targetKills}`}`;
  }

  // ============================================================================
  // 7. GIAO DIỆN ĐIỀU KHIỂN NỔI TRONG GAME (FLOATING HUD PANEL)
  // ============================================================================
  let hudRefs = null;

  function createHUD() {
    if (document.getElementById("nro-deep-bot-hud")) return;

    const container = document.createElement("div");
    container.id = "nro-deep-bot-hud";
    container.style.cssText = `
      position: fixed;
      top: 12px;
      right: 12px;
      width: 360px;
      background: rgba(15, 23, 42, 0.94);
      color: #f8fafc;
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      font-size: 12.5px;
      border: 1px solid #38bdf8;
      border-radius: 10px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.65);
      z-index: 999999;
      user-select: none;
      overflow: hidden;
      backdrop-filter: blur(6px);
    `;

    container.innerHTML = `
      <div id="nro-bot-header" style="background: linear-gradient(90deg, #0284c7, #0369a1); padding: 8px 12px; font-weight: 700; display: flex; justify-content: space-between; align-items: center; cursor: move;">
        <span>🐉 NRO DEEP MEMORY BOT v2.4.6</span>
        <div style="display:flex; gap:6px; align-items:center;">
          <span id="nro-ram-badge" style="background:#ef4444; color:#fff; font-size:10px; padding:2px 6px; border-radius:4px;">WASM: CHỜ</span>
          <button id="nro-btn-min" style="background:transparent; border:none; color:#fff; font-weight:bold; cursor:pointer; font-size:14px;">−</button>
        </div>
      </div>

      <div id="nro-bot-body" style="padding: 10px 12px; display: flex; flex-direction: column; gap: 8px;">
        <!-- Telemetry từ RAM -->
        <div style="background: rgba(30, 41, 59, 0.85); border: 1px solid #334155; border-radius: 6px; padding: 7px 9px; line-height: 1.55;">
          <div>🗺️ <b>Bản đồ:</b> <span id="nro-lbl-map" style="color:#38bdf8;">Đang đọc RAM...</span></div>
          <div>❤️ <b>HP:</b> <span id="nro-lbl-hp" style="color:#4ade80;">0/0</span> | 💧 <b>KI:</b> <span id="nro-lbl-mp" style="color:#60a5fa;">0/0</span></div>
          <div>📍 <b>Tọa độ:</b> <span id="nro-lbl-pos">(0, 0)</span> | 👾 <b>Quái sống:</b> <span id="nro-lbl-mobs">0</span></div>
          <div>⚡ <b>Tàn Sát (RAM):</b> <span id="nro-lbl-ts">TẮT</span> | 🧭 <b>Xmap:</b> <span id="nro-lbl-gb">TẮT</span></div>
          <div>📜 <b>Nhiệm vụ RAM:</b> <span id="nro-lbl-task" style="color:#fbbf24;">Đang đọc...</span></div>
        </div>

        <!-- Chọn kịch bản nhiệm vụ -->
        <div style="display:flex; flex-direction:column; gap:4px;">
          <label style="font-weight:600; color:#cbd5e1;">Chế độ Nhiệm vụ:</label>
          <select id="nro-sel-preset" style="background:#1e293b; color:#f8fafc; border:1px solid #475569; border-radius:5px; padding:5px 6px; font-size:12px;">
            <option value="auto_ram_quest">🤖 Tự động 100% theo Nhiệm Vụ trong Game (RAM + Báo cáo NPC)</option>
            <option value="quest_comic_snail">📚 NV Ốc Truyện Tranh (Một mạch + Tự nhặt & Báo cáo NPC)</option>
            <option value="boss_quest_trums">👑 NV Tiêu Diệt Trùm: Akkuman (19) → Tamborine (6) → Drum (10)</option>
            <option value="clan_quest_bulon">NV Bang Hội 2: Bulon (30) → Ukulele (34) → Quỷ Mập (38)</option>
            <option value="quest_pigs">NV Săn 3 Loại Heo: Bamboo (27) → Hoa vàng (31) → Rừng cọ (35)</option>
            <option value="custom_single_map">Tùy chỉnh: Xmap tới Map ID & Đánh đủ N quái</option>
          </select>
        </div>

        <!-- Cấu hình nhanh Bước hiện tại / Map ID & Số quái -->
        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:6px; background: rgba(30, 41, 59, 0.6); padding:6px 8px; border-radius:6px; border:1px solid #334155;">
          <div>
            <label style="font-size:11px; color:#94a3b8;">Bước chạy:</label>
            <input id="nro-inp-stage" type="number" min="1" max="10" value="1" style="width:100%; box-sizing:border-box; background:#0f172a; color:#fff; border:1px solid #475569; border-radius:4px; padding:3px 5px; font-size:12px;">
          </div>
          <div>
            <label style="font-size:11px; color:#94a3b8;">Map ID đích:</label>
            <input id="nro-inp-mapid" type="number" min="0" max="200" value="30" style="width:100%; box-sizing:border-box; background:#0f172a; color:#fff; border:1px solid #475569; border-radius:4px; padding:3px 5px; font-size:12px;">
          </div>
          <div>
            <label style="font-size:11px; color:#94a3b8;">Số quái cần hạ:</label>
            <input id="nro-inp-kills" type="number" min="0" max="9999" value="30" style="width:100%; box-sizing:border-box; background:#0f172a; color:#fff; border:1px solid #475569; border-radius:4px; padding:3px 5px; font-size:12px;">
          </div>
        </div>

        <!-- Tùy chọn thông minh trong RAM -->
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px; font-size:11.5px; color:#e2e8f0;">
          <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
            <input type="checkbox" id="nro-chk-nesieuquai" checked> Né Siêu Quái (RAM)
          </label>
          <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
            <input type="checkbox" id="nro-chk-goback" checked> Tự Goback khi chết
          </label>
          <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
            <input type="checkbox" id="nro-chk-autopick" checked> Tự nhặt vật phẩm
          </label>
          <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
            <input type="checkbox" id="nro-chk-avoidboss" checked> Né Boss (Đổi khu)
          </label>
          <label style="display:flex; align-items:center; gap:5px; cursor:pointer; grid-column: span 2;">
            <input type="checkbox" id="nro-chk-telepem"> Dịch chuyển đánh (Tele)
          </label>
        </div>

        <!-- Thanh tiến độ & Trạng thái -->
        <div style="background:#0f172a; border:1px solid #334155; border-radius:6px; padding:7px 9px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-weight:600;">
            <span id="nro-lbl-stagename" style="color:#38bdf8;">Mục tiêu hiện tại</span>
            <span id="nro-lbl-progress" style="color:#fbbf24;">0 / 30</span>
          </div>
          <div style="width:100%; height:7px; background:#1e293b; border-radius:4px; overflow:hidden; margin-bottom:6px;">
            <div id="nro-bar-progress" style="width:0%; height:100%; background:linear-gradient(90deg, #22c55e, #10b981); transition:width 0.15s;"></div>
          </div>
          <div id="nro-lbl-status" style="font-size:11.5px; color:#cbd5e1; min-height:16px;">Đang chờ lệnh...</div>
        </div>

        <!-- Nút điều khiển chính -->
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
          <button id="nro-btn-toggle" style="background:#16a34a; color:#fff; border:none; border-radius:6px; padding:8px; font-weight:700; cursor:pointer; font-size:12.5px;">▶ BẮT ĐẦU AUTO</button>
          <button id="nro-btn-nextstage" style="background:#2563eb; color:#fff; border:none; border-radius:6px; padding:8px; font-weight:600; cursor:pointer; font-size:12px;">⏭ Qua Bước Kế</button>
        </div>

        <!-- Công cụ điều khiển RAM trực tiếp -->
        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:5px;">
          <button id="nro-btn-ram-ts" style="background:#334155; color:#f8fafc; border:1px solid #475569; border-radius:5px; padding:5px; font-size:11px; cursor:pointer;">⚡ Bật/Tắt TS</button>
          <button id="nro-btn-ram-xmap" style="background:#334155; color:#f8fafc; border:1px solid #475569; border-radius:5px; padding:5px; font-size:11px; cursor:pointer;">🚀 Xmap Tới ID</button>
          <button id="nro-btn-ram-stop" style="background:#7f1d1d; color:#fecaca; border:1px solid #ef4444; border-radius:5px; padding:5px; font-size:11px; cursor:pointer;">🛑 Dừng Khẩn</button>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    const header = container.querySelector("#nro-bot-header");
    let isDragging = false, dragOffX = 0, dragOffY = 0;
    header.addEventListener("mousedown", (e) => {
      if (e.target.id === "nro-btn-min") return;
      isDragging = true;
      const rect = container.getBoundingClientRect();
      dragOffX = e.clientX - rect.left;
      dragOffY = e.clientY - rect.top;
    });
    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      container.style.left = Math.max(0, e.clientX - dragOffX) + "px";
      container.style.top = Math.max(0, e.clientY - dragOffY) + "px";
      container.style.right = "auto";
    });
    window.addEventListener("mouseup", () => { isDragging = false; });

    const bodyEl = container.querySelector("#nro-bot-body");
    const minBtn = container.querySelector("#nro-btn-min");
    minBtn.addEventListener("click", () => {
      const hidden = bodyEl.style.display === "none";
      bodyEl.style.display = hidden ? "flex" : "none";
      minBtn.textContent = hidden ? "−" : "+";
    });

    hudRefs = {
      badge: container.querySelector("#nro-ram-badge"),
      map: container.querySelector("#nro-lbl-map"),
      hp: container.querySelector("#nro-lbl-hp"),
      mp: container.querySelector("#nro-lbl-mp"),
      pos: container.querySelector("#nro-lbl-pos"),
      mobs: container.querySelector("#nro-lbl-mobs"),
      ts: container.querySelector("#nro-lbl-ts"),
      gb: container.querySelector("#nro-lbl-gb"),
      task: container.querySelector("#nro-lbl-task"),
      selPreset: container.querySelector("#nro-sel-preset"),
      inpStage: container.querySelector("#nro-inp-stage"),
      inpMapId: container.querySelector("#nro-inp-mapid"),
      inpKills: container.querySelector("#nro-inp-kills"),
      chkNeSieuQuai: container.querySelector("#nro-chk-nesieuquai"),
      chkGoback: container.querySelector("#nro-chk-goback"),
      chkAutoPick: container.querySelector("#nro-chk-autopick"),
      chkAvoidBoss: container.querySelector("#nro-chk-avoidboss"),
      chkTelePem: container.querySelector("#nro-chk-telepem"),
      stageName: container.querySelector("#nro-lbl-stagename"),
      progress: container.querySelector("#nro-lbl-progress"),
      bar: container.querySelector("#nro-bar-progress"),
      status: container.querySelector("#nro-lbl-status"),
      btnToggle: container.querySelector("#nro-btn-toggle"),
      btnNextStage: container.querySelector("#nro-btn-nextstage"),
      btnRamTs: container.querySelector("#nro-btn-ram-ts"),
      btnRamXmap: container.querySelector("#nro-btn-ram-xmap"),
      btnRamStop: container.querySelector("#nro-btn-ram-stop")
    };

    function syncInputsFromCurrentStage() {
      const preset = QUEST_PRESETS[bot.presetKey];
      if (!preset || preset.autoFromRam) return;
      const st = preset.stages[bot.stageIndex] || preset.stages[0];
      if (!st) return;
      hudRefs.inpStage.value = bot.stageIndex + 1;
      if (st.mapId !== "HOME") {
        hudRefs.inpMapId.value = st.mapId;
      }
      hudRefs.inpKills.value = st.targetKills;
    }

    hudRefs.selPreset.addEventListener("change", () => {
      bot.presetKey = hudRefs.selPreset.value;
      bot.stageIndex = 0;
      resetStageTracking();
      syncInputsFromCurrentStage();
    });

    hudRefs.inpStage.addEventListener("change", () => {
      const preset = QUEST_PRESETS[bot.presetKey];
      if (!preset || preset.autoFromRam) return;
      const idx = Math.max(0, Math.min(preset.stages.length - 1, parseInt(hudRefs.inpStage.value, 10) - 1 || 0));
      bot.stageIndex = idx;
      resetStageTracking();
      syncInputsFromCurrentStage();
    });

    hudRefs.inpMapId.addEventListener("change", () => {
      const preset = QUEST_PRESETS[bot.presetKey];
      if (!preset || preset.autoFromRam || !preset.stages[bot.stageIndex]) return;
      const val = parseInt(hudRefs.inpMapId.value, 10);
      if (!isNaN(val) && val >= 0) {
        preset.stages[bot.stageIndex].mapId = val;
      }
    });

    hudRefs.inpKills.addEventListener("change", () => {
      const preset = QUEST_PRESETS[bot.presetKey];
      if (!preset || preset.autoFromRam || !preset.stages[bot.stageIndex]) return;
      const val = parseInt(hudRefs.inpKills.value, 10);
      if (!isNaN(val) && val >= 0) {
        preset.stages[bot.stageIndex].targetKills = val;
      }
    });

    const syncCheckboxes = () => {
      bot.options.neSieuQuai = hudRefs.chkNeSieuQuai.checked;
      bot.options.autoGoback = hudRefs.chkGoback.checked;
      bot.options.autoPick = hudRefs.chkAutoPick.checked;
      bot.options.avoidBoss = hudRefs.chkAvoidBoss.checked;
      bot.options.telePem = hudRefs.chkTelePem.checked;
    };
    hudRefs.chkNeSieuQuai.addEventListener("change", syncCheckboxes);
    hudRefs.chkGoback.addEventListener("change", syncCheckboxes);
    hudRefs.chkAutoPick.addEventListener("change", syncCheckboxes);
    hudRefs.chkAvoidBoss.addEventListener("change", syncCheckboxes);
    hudRefs.chkTelePem.addEventListener("change", syncCheckboxes);

    hudRefs.btnToggle.addEventListener("click", () => {
      bot.running = !bot.running;
      if (bot.running) {
        syncCheckboxes();
        bot.lastXmapTriggerTime = 0;
        bot.lastXmapTargetId = -1;
        hudRefs.btnToggle.textContent = "⏸ TẠM DỪNG AUTO";
        hudRefs.btnToggle.style.background = "#d97706";
      } else {
        setTanSatInRam(false);
        stopXmapInRam();
        bot.statusText = "⏸ Đã tạm dừng Auto.";
        hudRefs.btnToggle.textContent = "▶ BẮT ĐẦU AUTO";
        hudRefs.btnToggle.style.background = "#16a34a";
      }
    });

    hudRefs.btnNextStage.addEventListener("click", () => {
      const preset = QUEST_PRESETS[bot.presetKey];
      if (!preset || preset.autoFromRam) return;
      setTanSatInRam(false);
      stopXmapInRam();
      bot.stageIndex = (bot.stageIndex + 1) % preset.stages.length;
      resetStageTracking();
      syncInputsFromCurrentStage();
      bot.statusText = `⏭ Đã chuyển sang Bước ${bot.stageIndex + 1}.`;
    });

    hudRefs.btnRamTs.addEventListener("click", () => {
      const st = readGameState();
      if (!st) return;
      syncCheckboxes();
      setTanSatInRam(!st.tanSat, bot.options);
    });

    hudRefs.btnRamXmap.addEventListener("click", () => {
      const st = readGameState();
      const targetId = parseInt(hudRefs.inpMapId.value, 10);
      if (!isNaN(targetId) && targetId >= 0) {
        startXmapInRam(targetId, st ? st.mapId : -1);
        bot.statusText = `🚀 Đang Xmap trực tiếp tới ${MAP_NAMES[targetId] || ("Map " + targetId)} (ID: ${targetId})...`;
      }
    });

    hudRefs.btnRamStop.addEventListener("click", () => {
      bot.running = false;
      setTanSatInRam(false);
      stopXmapInRam();
      hudRefs.btnToggle.textContent = "▶ BẮT ĐẦU AUTO";
      hudRefs.btnToggle.style.background = "#16a34a";
      bot.statusText = "🛑 Đã dừng khẩn cấp mọi tác vụ Xmap & Tàn Sát.";
    });
  }

  function updateHUD(state) {
    if (!hudRefs) {
      if (document.body) createHUD();
      return;
    }

    if (!state) {
      hudRefs.badge.textContent = "WASM: ĐANG BẮT...";
      hudRefs.badge.style.background = "#ef4444";
      return;
    }

    hudRefs.badge.textContent = "WASM: ĐÃ KẾT NỐI";
    hudRefs.badge.style.background = "#16a34a";

    hudRefs.map.textContent = `${state.mapName} (ID: ${state.mapId}) - Khu ${state.zoneId}`;
    hudRefs.hp.textContent = `${state.cHP.toLocaleString()}/${state.cHPFull.toLocaleString()}`;
    hudRefs.mp.textContent = `${state.cMP.toLocaleString()}/${state.cMPFull.toLocaleString()}`;
    hudRefs.pos.textContent = `(${state.cx}, ${state.cy})`;
    hudRefs.mobs.textContent = `${state.aliveMobs} / ${state.mobs.length}`;

    hudRefs.ts.textContent = state.tanSat ? "ĐANG BẬT" : "TẮT";
    hudRefs.ts.style.color = state.tanSat ? "#4ade80" : "#94a3b8";

    hudRefs.gb.textContent = state.isXmapRunning ? `ĐANG CHẠY (-> Map ${state.xmapTargetId})` : "TẮT";
    hudRefs.gb.style.color = state.isXmapRunning ? "#38bdf8" : "#94a3b8";

    if (state.taskMaint) {
      const stepLabel = state.taskMaint.activeStepName || `Bước ${state.taskMaint.index}`;
      hudRefs.task.textContent = `${stepLabel} (${state.taskMaint.count}/${state.taskMaint.max})`;
    }

    const req = getActiveTaskRequirement(state);
    if (req && !req.finished) {
      const destName = MAP_NAMES[req.mapId] || ("Map " + req.mapId);
      hudRefs.stageName.textContent = `${req.stepName} ➔ ${destName} (ID: ${req.mapId})`;
      if (req.isCollectStep) {
        hudRefs.progress.textContent = "Săn nhặt đồ";
        hudRefs.bar.style.width = "100%";
      } else if (req.isNpcStep) {
        hudRefs.progress.textContent = "Báo cáo NPC";
        hudRefs.bar.style.width = "100%";
      } else {
        hudRefs.progress.textContent = req.targetKills > 0 ? `${req.currentKills} / ${req.targetKills}` : "Di chuyển";
        const pct = req.targetKills > 0 ? Math.min(100, Math.round((req.currentKills / req.targetKills) * 100)) : 100;
        hudRefs.bar.style.width = pct + "%";
      }

      if (QUEST_PRESETS[bot.presetKey] && QUEST_PRESETS[bot.presetKey].autoFromRam) {
        hudRefs.inpMapId.value = req.mapId;
        hudRefs.inpKills.value = req.isCollectStep ? 1 : req.targetKills;
      } else if (document.activeElement !== hudRefs.inpStage) {
        hudRefs.inpStage.value = bot.stageIndex + 1;
      }
    }

    hudRefs.status.textContent = bot.statusText;
  }

  window.__NRO_DEEP_BOT_TIMER__ = setInterval(tickBot, 250);
  console.log("[NRO Deep Bot v2.4.4] Đã nạp thành công! Sửa dứt điểm Tàu vũ trụ (loại bỏ hoàn toàn Uron bán sách, tự động đóng shop & chọn bay sang Namếc/Xayda/Trái Đất).");
})();
