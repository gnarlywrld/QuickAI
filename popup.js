document.addEventListener("DOMContentLoaded", () => {
    const summarizeBtn = document.getElementById("summarize");
    const copyBtn = document.getElementById("copy-btn");
    const result = document.getElementById("result");
    const summaryTypeSelect = document.getElementById("summary-type");

    summarizeBtn.addEventListener("click", () => {
        const summaryType = summaryTypeSelect.value;

        result.innerHTML = `<div class="loader"><span></span><span></span><span></span></div>`;

        chrome.storage.sync.get(["geminiApiKey"], ({ geminiApiKey }) => {
            if (!geminiApiKey) {
                result.textContent = "No API key set. Click the gear icon to add one.";
                return;
            }

            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs[0] || !tabs[0].id) {
                    result.textContent = "No active tab found.";
                    return;
                }

                chrome.tabs.sendMessage(
                    tabs[0].id,
                    { type: "GET_ARTICLE_TEXT" },
                    async (response) => {
                        if (chrome.runtime.lastError) {
                            result.textContent = "Cannot connect to content script on this page.";
                            return;
                        }

                        if (!response || !response.text) {
                            result.textContent = "Couldn't extract text from this page.";
                            return;
                        }

                        try {
                            const summary = await getGeminiSummaryWithRetry(response.text, summaryType, geminiApiKey);
                            const cleanText = summary.replace(/\*\*/g, "").replace(/^\* /gm, "- ").trim();
                            result.textContent = cleanText;
                        } catch (error) {
                            result.textContent = "Gemini error: " + error.message;
                        }
                    }
                );
            });
        });
    });

    copyBtn.addEventListener("click", () => {
        const txt = result.innerText;
        if (!txt) return;

        navigator.clipboard.writeText(txt).then(() => {
            const oldText = copyBtn.textContent;
            copyBtn.textContent = "Copied!";
            setTimeout(() => (copyBtn.textContent = oldText), 2000);
        });
    });
});

async function getGeminiSummaryWithRetry(rawText, type, apiKey, retries = 3, delay = 3000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await getGeminiSummary(rawText, type, apiKey);
        } catch (err) {
            const msg = err.message.toLowerCase();
            if ((msg.includes("overloaded") || msg.includes("service is currently unavailable") || msg.includes("503")) && i < retries - 1) {
                await new Promise(r => setTimeout(r, delay));
            } else {
                throw err;
            }
        }
    }
}

async function getGeminiSummary(rawText, type, apiKey) {
    const max = 20000;
    const text = rawText.length > max ? rawText.slice(0, max) + "..." : rawText;

    const promptMap = {
        brief: `Summarize in 2-3 sentences:\n\n${text}`,
        detailed: `Give a detailed summary:\n\n${text}`,
        bullets: `Summarize in 3-5 bullet points (start each line with "- "):\n\n${text}`,
    };

    const prompt = promptMap[type] || promptMap.brief;

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.2, maxOutputTokens: 1024, topP: 0.9 }
            }),
        }
    );

    if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error?.message || "Request failed");
    }

    const data = await res.json();
    let output = "No summary.";
    const candidate = data.candidates?.[0];

    if (candidate) {
        if (candidate.output && candidate.output.length > 0) {
            output = candidate.output
                .map(block => block.content?.map(c => c.text || "").join("\n") || "")
                .filter(Boolean)
                .join("\n")
                .trim();
        }

        if ((!output || output === "" || output === "No summary.") && candidate.content?.parts) {
            output = candidate.content.parts.map(p => p.text || "").join("\n").trim();
        }

        if ((!output || output === "" || output === "No summary.") && candidate.thoughts?.text) {
            output = candidate.thoughts.text.trim();
        }
    }

    return output || "No summary.";
}
