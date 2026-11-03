"use strict";

// All lines below are original fan-created desktop-pet dialogue, not official quotations.
window.RONOVA_CHARACTER = Object.freeze({
  title: "若娜瓦",
  subtitle: "死之执政·桌面巡游",
  settingsDefaults: {
    apiKey: "",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    userName: "旅行者",
    autoTalk: true,
    autoTalkMinutes: 5,
    launchAtLogin: false,
    liveliness: "balanced"
  },
  startupLine: "若娜瓦。你为我留下的位置……倒也不算拥挤。",
  dragLines: [
    "不必如此。我可以自己过去。",
    "至少，先告诉我你要去哪里。",
    "……这便是你迎接执政的礼节？",
    "放稳一些。我的羽翼并非扶手。"
  ],
  selfTalkFallback: [
    "这里的秩序，还算安稳。",
    "又一阵风。连羽尖都不肯安静。",
    "你继续。我只是在这里停留片刻。",
    "这页看过了……再确认一遍，也无妨。",
    "一枚小小的光点，竟有这么多去处。",
    "杯中的热气已经散了。现在应当正好。",
    "夜深了。凡事都应有停歇的时候。",
    "安静也并非空无。这样，便很好。"
  ],
  actions: {
    observe: {
      label: "静静观测", symbol: "◇", color: "#bca5bb", duration: 7200,
      lines: ["你忙你的。我会看着。", "这片小小的桌面，倒有不少动静。", "不必因我的注视而分心。"]
    },
    verdict: {
      label: "指尖裁定", symbol: "✧", color: "#d84b66", duration: 5600,
      lines: ["此刻的裁定：先把眼前的事做好。", "无须慌张。一件一件来。", "既已决定，便不要轻易动摇。"]
    },
    feather: {
      label: "托起红羽", symbol: "✦", color: "#c83b53", duration: 6400,
      lines: ["一枚羽毛而已。拿稳些。", "它落在这里，并非什么预兆。", "看够了，便还给我吧。"]
    },
    tea: {
      label: "静候茶温", symbol: "☕", color: "#bd8d76", duration: 7800,
      lines: ["……再放片刻。温度尚未合适。", "一杯茶，也不必如此匆忙。", "替你留了一些。只是恰好倒多了。"]
    },
    ledger: {
      label: "翻阅小册", symbol: "▤", color: "#b6a6c4", duration: 8200,
      lines: ["这一页尚未读完。稍候。", "凡人的记述，有时也值得停留。", "先前的约定，我还记得。"]
    },
    cookie: {
      label: "品尝饼干", symbol: "◈", color: "#c69b70", duration: 7000,
      lines: ["口感倒不复杂。……再留一枚吧。", "我只是确认它是否烤得恰好。", "不必盯着我。你也有一份。"]
    },
    hideSnack: {
      label: "翼后小秘密", symbol: "⋯", color: "#c89aa9", duration: 5800,
      lines: ["羽翼后面？没有什么需要你在意的。", "只是暂且收好。免得落了碎屑。", "……你看得太仔细了。"]
    },
    pout: {
      label: "轻轻皱眉", symbol: "!", color: "#c85068", duration: 5200,
      lines: ["适可而止。我的耐心并非无穷。", "你似乎很擅长制造小麻烦。", "……这次便不与你计较。"]
    },
    blush: {
      label: "移开目光", symbol: "·", color: "#d992a6", duration: 5400,
      lines: ["这样的赞誉，倒不必反复说。", "我听见了。你可以继续做事。", "……目光收敛一些。"]
    },
    hug: {
      label: "羽翼相拥", symbol: "♡", color: "#cc7d98", duration: 6400,
      lines: ["若只是想靠近，直说便是。", "留在这里片刻也无妨。", "不必勉强自己。先安静一会儿。"]
    },
    doze: {
      label: "拢翼小憩", symbol: "☾", color: "#a398bd", duration: 10000,
      lines: ["我只是闭目片刻。", "这里很安静。暂且如此吧。", "待我醒来，再听你的琐事。"]
    },
    wings: {
      label: "舒展红翼", symbol: "⋈", color: "#c33350", duration: 6600,
      lines: ["让开一点。羽翼需要些空间。", "毋须惊讶，只是舒展一下。", "连这里的风，也要绕过我的羽尖。"]
    },
    smile: {
      label: "一瞬浅笑", symbol: "✧", color: "#d6a1ac", duration: 5200,
      lines: ["做得不错。这句话无需我再说一次。", "嗯。这样的结果，尚可。", "你今天的神情，倒比方才轻松。"]
    },
    glide: {
      label: "红羽巡游", symbol: "◇", color: "#b64863", duration: 5400,
      lines: ["我去另一侧看看。", "不必追随，只是巡视片刻。", "这里的风，倒适合慢一些。"]
    },
    run: {
      label: "提裙快步", symbol: "»", color: "#ce6478", duration: 4600,
      lines: ["让一让。我要从这里经过。", "只是换个位置，不值得如此注目。", "……那枚光点，方才停在哪里？"]
    }
  }
});
