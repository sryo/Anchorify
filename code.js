if (figma.currentPage) {
    const MARKDOWN_PATTERN = /\[([^\]]+)]\(([^)]+)\)/g;
    const HTML_PATTERN = /<a href="([^"]+)">([^<]+)<\/a>/g;
    const BBCODE_PATTERN = /\[url=([^\]]+)]([^[]+)\[\/url]/g;
    const CREOLE_PATTERN = /\[\[([^\|]+)\|([^\]]+)\]\]/g;

    const linkPatterns = [
        { regex: MARKDOWN_PATTERN, urlIndex: 2, textIndex: 1 },
        { regex: HTML_PATTERN, urlIndex: 1, textIndex: 2 },
        { regex: BBCODE_PATTERN, urlIndex: 1, textIndex: 2 },
        { regex: CREOLE_PATTERN, urlIndex: 2, textIndex: 1 }
    ];

    const anchorifyLinksInTextNode = (textNode) => {
        let extractedLinks = [];
        for (let pattern of linkPatterns) {
            let match;
            while ((match = pattern.regex.exec(textNode.characters)) !== null) {
                const start = match.index;
                const end = start + match[0].length;
                const linkText = match[pattern.textIndex];
                const url = match[pattern.urlIndex];
                extractedLinks.push({ start, end, linkText, url });
            }
        }
        return extractedLinks;
    };

    const textNodesOnCurrentPage = figma.currentPage.findAll(node => node.type === "TEXT");
    const fontLoadPromises = textNodesOnCurrentPage.map(textNode => figma.loadFontAsync(textNode.fontName));

    let totalLinksAnchorified = 0;

    Promise.all(fontLoadPromises).then(() => {
        textNodesOnCurrentPage.forEach((textNode) => {
            let linkModifications = anchorifyLinksInTextNode(textNode);
            if (!linkModifications.length) return;

            totalLinksAnchorified += linkModifications.length;

            linkModifications.sort((a, b) => a.start - b.start);

            let anchorifiedTextContent = textNode.characters;
            let offset = 0;
            linkModifications.forEach(modification => {
                anchorifiedTextContent = anchorifiedTextContent.substring(0, modification.start + offset) 
                                         + modification.linkText 
                                         + anchorifiedTextContent.substring(modification.end + offset);
                offset += modification.linkText.length - (modification.end - modification.start);
            });
            textNode.characters = anchorifiedTextContent;

            offset = 0;
            linkModifications.forEach(modification => {
                const newStart = modification.start + offset;
                const newEnd = newStart + modification.linkText.length;

                textNode.setRangeHyperlink(newStart, newEnd, { type: 'URL', value: modification.url });
                textNode.setRangeTextDecoration(newStart, newEnd, 'UNDERLINE');
                offset += modification.linkText.length - (modification.end - modification.start);
            });
        });

        figma.currentPage.setRelaunchData({ anchorify: 'Click to re-anchorify the links on this page' });
        figma.notify(`Anchorified ${totalLinksAnchorified} links in ${textNodesOnCurrentPage.length} text nodes.`);
        figma.closePlugin();
    });
}
