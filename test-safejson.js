const safeJSON1 = (text, fallback = []) => {
    if (!text) return fallback;
    try {
        const startArr = text.indexOf('[');
        const endArr = text.lastIndexOf(']');
        const startObj = text.indexOf('{');
        const endObj = text.lastIndexOf('}');
        let startIndex = -1;
        let endIndex = -1;
        if (startArr !== -1 && endArr !== -1 && (startObj === -1 || startArr < startObj)) {
            startIndex = startArr;
            endIndex = endArr + 1;
        } else if (startObj !== -1 && endObj !== -1) {
            startIndex = startObj;
            endIndex = endObj + 1;
        }
        if (startIndex !== -1 && endIndex === -1) {
            const partial = text.substring(startIndex).trim();
            const lastBrace = partial.lastIndexOf('}');
            if (lastBrace !== -1) {
                const recovered = partial.substring(0, lastBrace + 1) + (startArr !== -1 ? ']' : '');
                try { return JSON.parse(recovered); } catch (e) { }
            }
        }
        if (startIndex !== -1 && endIndex !== -1) {
            const jsonStr = text.substring(startIndex, endIndex);
            try { return JSON.parse(jsonStr); } catch (err) {
                const lastBrace = jsonStr.lastIndexOf('}');
                if (lastBrace !== -1) {
                    const recovered = jsonStr.substring(0, lastBrace + 1) + (startArr !== -1 ? ']' : '');
                    try { return JSON.parse(recovered); } catch (e) { }
                }
                throw err;
            }
        }
        const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        return fallback;
    }
};

const safeJSON2 = (text, fallback = []) => {
    if (!text) return fallback;
    let cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

    try {
        return JSON.parse(cleaned);
    } catch (e) {
        try {
            const firstBracket = cleaned.indexOf('[');
            const firstBrace = cleaned.indexOf('{');
            let isArray = false;
            let startIndex = -1;

            if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
                isArray = true;
                startIndex = firstBracket;
            } else if (firstBrace !== -1) {
                isArray = false;
                startIndex = firstBrace;
            }

            if (startIndex !== -1) {
                const partial = cleaned.substring(startIndex);
                let braceDepth = 0;
                let bracketDepth = 0;
                let inString = false;
                let escapeNext = false;
                let lastValidEnd = -1;

                for (let i = 0; i < partial.length; i++) {
                    const char = partial[i];
                    if (escapeNext) { escapeNext = false; continue; }
                    if (char === '\\') { escapeNext = true; continue; }
                    if (char === '"') { inString = !inString; continue; }

                    if (!inString) {
                        if (char === '{') braceDepth++;
                        else if (char === '}') {
                            braceDepth--;
                            if (isArray && braceDepth === 0 && bracketDepth === 1) {
                                lastValidEnd = i;
                            } else if (!isArray && braceDepth === 0) {
                                lastValidEnd = i;
                            }
                        }
                        else if (char === '[') bracketDepth++;
                        else if (char === ']') bracketDepth--;
                    }
                }

                if (lastValidEnd !== -1) {
                    const recovered = partial.substring(0, lastValidEnd + 1) + (isArray ? ']' : '');
                    return JSON.parse(recovered);
                }
            }
        } catch (recoveryErr) {
            console.warn('safeJSON2 recovery failed:', recoveryErr.message);
        }
        return fallback;
    }
};

const truncatedRes = `[
  { "id": "1", "val": [] },
  { "id": "2", "val": [`;
console.log("OLD", safeJSON1(truncatedRes, []));
console.log("OLD IS ARRAY?", Array.isArray(safeJSON1(truncatedRes, [])));

console.log("NEW", safeJSON2(truncatedRes, []));
console.log("NEW IS ARRAY?", Array.isArray(safeJSON2(truncatedRes, [])));
