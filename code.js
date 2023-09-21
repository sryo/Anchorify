if (figma.currentPage) {
    const patterns = [
        { regex: /\[([^\]]+)]\(([^)]+)\)/g, urlIndex: 2, textIndex: 1 },
        { regex: /<a href="([^"]+)">([^<]+)<\/a>/g, urlIndex: 1, textIndex: 2 },
        { regex: /\[url=([^\]]+)]([^[]+)\[\/url]/g, urlIndex: 1, textIndex: 2 },
        { regex: /(https:\/\/[^\[]+)\[([^\]]+)\]/g, urlIndex: 1, textIndex: 2 }, // AsciiDoc pattern
        { regex: /\[\[([^\|]+)\|([^\]]+)\]\]/g, urlIndex: 2, textIndex: 1 }    // Creole pattern with display text
    ];

    const findAllLinks = (textNode) => {
        let changes = [];
        for (let pattern of patterns) {
            let match;
            while ((match = pattern.regex.exec(textNode.characters)) !== null) {
                const start = match.index;
                const end = start + match[0].length;
                const linkText = match[pattern.textIndex];
                const url = match[pattern.urlIndex];
                changes.push({ start, end, linkText, url });
            }
        }
        return changes;
    };

    const textNodes = figma.currentPage.findAll(node => node.type === "TEXT");
    const loadFontsPromises = textNodes.map(textNode => figma.loadFontAsync(textNode.fontName));

    let totalLinksAnchorified = 0;

    Promise.all(loadFontsPromises).then(() => {
        textNodes.forEach((textNode) => {
            let changes = findAllLinks(textNode);
            if (!changes.length) return;

            totalLinksAnchorified += changes.length;

            // Sort changes by starting index to ensure modifications are applied in order
            changes.sort((a, b) => a.start - b.start);

            let modifiedText = textNode.characters;
            let offset = 0;
            changes.forEach(change => {
                modifiedText = modifiedText.substring(0, change.start + offset) + change.linkText + modifiedText.substring(change.end + offset);
                offset += change.linkText.length - (change.end - change.start);
            });
            textNode.characters = modifiedText;

            // Reapply hyperlinks after modification
            offset = 0;
            changes.forEach(change => {
                const newStart = change.start + offset;
                const newEnd = newStart + change.linkText.length;

                textNode.setRangeHyperlink(newStart, newEnd, { type: 'URL', value: change.url });
                textNode.setRangeTextDecoration(newStart, newEnd, 'UNDERLINE');
                offset += change.linkText.length - (change.end - change.start);
            });
        });

        figma.currentPage.setRelaunchData({ anchorify: 'Click to re-anchorify the links on this page' });
        
        // Provide a detailed notification
        figma.notify(`Anchorified ${totalLinksAnchorified} links in ${textNodes.length} text nodes.`);
        figma.closePlugin();
    });
}
