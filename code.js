if (figma.currentPage) {
  const getLinkMatches = (text) => {
    const patterns = [
      {
        regex: /\[([^\]]+)]\(([^)]+)\)/g,
        urlIndex: 2,
        textIndex: 1,
        type: "MARKDOWN",
      },
      {
        regex: /<a\s+href=["'”](.*?)["'”]>([^<]+)<\/a>/g,
        urlIndex: 1,
        textIndex: 2,
        type: "HTML",
      },
      {
        regex: /\[url=([^\]]+)]([^[]+)\[\/url]/g,
        urlIndex: 1,
        textIndex: 2,
        type: "BBCODE",
      },
      {
        regex: /((?:https?:\/\/|www\.)[^\s]*[^.,;)\s])/g,
        urlIndex: 1,
        textIndex: 1,
        type: "RAW",
      },
      {
        regex: /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/g,
        urlIndex: 1,
        textIndex: 1,
        type: "EMAIL",
      },
    ];

    let allMatches = [];
    for (let p of patterns) {
      let m;
      p.regex.lastIndex = 0;
      while ((m = p.regex.exec(text)) !== null) {
        allMatches.push({
          start: m.index,
          end: m.index + m[0].length,
          text: m[p.textIndex],
          url: m[p.urlIndex],
          type: p.type,
        });
      }
    }
    return allMatches;
  };

  const filterOverlaps = (matches) => {
    return matches.filter((m1, _, self) => {
      return !self.some(
        (m2) =>
          m2 !== m1 &&
          m2.start <= m1.start &&
          m2.end >= m1.end &&
          m2.end - m2.start > m1.end - m1.start,
      );
    });
  };

  const run = async () => {
    const scope =
      figma.currentPage.selection.length > 0
        ? figma.currentPage.selection.filter((n) => n.type === "TEXT")
        : figma.currentPage.findAll((n) => n.type === "TEXT");

    if (!scope.length) return figma.closePlugin();

    const uniqueFonts = new Set();
    for (const node of scope) {
      if (!node.characters) continue;
      node
        .getStyledTextSegments(["fontName"])
        .forEach((s) => uniqueFonts.add(JSON.stringify(s.fontName)));
    }
    await Promise.all(
      [...uniqueFonts].map((f) => figma.loadFontAsync(JSON.parse(f))),
    );

    let count = 0;
    let missingFrames = [];

    for (const node of scope) {
      if (!node.characters) continue;

      try {
        let matches = getLinkMatches(node.characters);
        if (!matches.length) continue;

        matches = filterOverlaps(matches);
        matches.sort((a, b) => b.start - a.start);

        for (const m of matches) {
          if (m.type !== "RAW" && m.type !== "EMAIL") {
            node.deleteCharacters(m.start, m.end);
            node.insertCharacters(m.start, m.text);
          }

          const rangeEnd = m.start + m.text.length;

          let hyperlinkValue = null;

          const cleanUrl = m.url.trim();

          if (cleanUrl.startsWith("->") || cleanUrl.startsWith("→")) {
            const prefixLen = cleanUrl.startsWith("->") ? 2 : 1;
            const targetName = cleanUrl.substring(prefixLen).trim();

            const targetNode = figma.currentPage.findOne(
              (n) => n.name === targetName,
            );

            if (targetNode) {
              hyperlinkValue = { type: "NODE", value: targetNode.id };
            } else {
              missingFrames.push(targetName);
              console.warn(
                `Magic Link failed: Could not find frame named "${targetName}"`,
              );
            }
          } else {
            let safeUrl = cleanUrl;
            if (m.type === "EMAIL") {
              if (!/^mailto:/.test(safeUrl)) safeUrl = "mailto:" + safeUrl;
            } else {
              if (!/^https?:\/\//i.test(safeUrl))
                safeUrl = "https://" + safeUrl;
            }
            hyperlinkValue = { type: "URL", value: safeUrl };
          }

          if (hyperlinkValue) {
            node.setRangeHyperlink(m.start, rangeEnd, hyperlinkValue);
            node.setRangeTextDecoration(m.start, rangeEnd, "UNDERLINE");
            count++;
          }
        }
      } catch (err) {
        console.error("Failed on node:", node.name, err);
      }
    }

    let msg = `Fixed ${count} links.`;
    if (missingFrames.length > 0) {
      msg += ` Warning: Could not find ${missingFrames.length} frames (check console).`;
    }
    figma.notify(msg);
    figma.closePlugin();
  };

  run();
}
