document.addEventListener("DOMContentLoaded", () => {
    chrome.storage.sync.get(["geminiApiKey"], ({ geminiApiKey }) => {
        if (geminiApiKey) document.getElementById("api-key").value = geminiApiKey;
    });

    document.getElementById("save-button").addEventListener("click", () => {
        const apiKey = document.getElementById("api-key").value.trim();
        if (!apiKey) return;

        chrome.storage.sync.set({ geminiApiKey: apiKey }, () => {
            const msg = document.getElementById("success-message");
            msg.style.display = "block";
            msg.style.opacity = 1; 

            
            setTimeout(() => window.close(), 2500);
        });
    });
});
