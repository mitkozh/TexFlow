import { browser } from "wxt/browser";
import ExtMessage, { MessageFrom, MessageType } from "@/entrypoints/types.ts";

export default defineBackground(() => {
    console.log('Hello background!', { id: browser.runtime.id });

    // @ts-ignore
    browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    // Only enable side panel on Google Docs document pages
    browser.tabs.onUpdated.addListener(async (tabId, info, tab) => {
        if (!tab.url) {
            return;
        }
        try {
            const url = new URL(tab.url);
            // Enable side panel only for Google Docs document pages
            if (
                url.hostname === 'docs.google.com' &&
                url.pathname.startsWith('/document/d/')
            ) {
                // @ts-ignore
                await browser.sidePanel.setOptions({
                    tabId,
                    path: 'sidepanel.html',
                    enabled: true
                });
            } else {
                // @ts-ignore
                await browser.sidePanel.setOptions({
                    // tabId,
                    enabled: false
                });
            }
        } catch (e) {
            console.log("Error parsing tab.url or updating side panel:", e, tab.url);
            // Ignore invalid URLs
        }
    });

    // Monitor the event from extension icon click
    // browser.action.onClicked.addListener((tab) => {
    //     console.log("click icon", tab);
    //     if (tab.id) {
    //         browser.tabs.sendMessage(tab.id, { messageType: MessageType.clickExtIcon });
    //     }
    // });

    // Main message handler
    browser.runtime.onMessage.addListener((message: any, sender, sendResponse: (message: any) => void) => {
        console.log("background message received:", message);

        // // Handle extension icon click event
        // if (message.messageType === MessageType.clickExtIcon) {
        //     console.log("Processing extension icon click", message);
        //     return true;
        // }
        // Handle theme or locale changes
        if (message.messageType === MessageType.changeTheme || message.messageType === MessageType.changeLocale) {
            handleThemeOrLocaleChange(message);
            return true;
        }
        // Handle Google Docs content fetching
        else if (message.messageType === MessageType.fetchDocumentContent && message.documentId) {
            handleFetchDocumentContent(message, sendResponse);
            return true;
        }
    });

    // Helper function to handle theme or locale changes
    async function handleThemeOrLocaleChange(message: any) {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        console.log(`Broadcasting to ${tabs.length} tabs`);

        if (tabs) {
            for (const tab of tabs) {
                if (tab.id) {
                    await browser.tabs.sendMessage(tab.id, message);
                }
            }
        }
    }

    // Helper function to handle document content fetching
    function handleFetchDocumentContent(message: any, sendResponse: any) {
        // @ts-ignore - Chrome specific API
        browser.identity.getAuthToken({ interactive: true }, async (token: string) => {
            console.log("OAuth token obtained:", token);
            if (!token) {
                sendResponse({ error: "No OAuth token obtained." });
                return;
            }

            try {
                const response = await fetch(
                    `https://docs.googleapis.com/v1/documents/${message.documentId}`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            "Content-Type": "application/json",
                        },
                    }
                );

                if (!response.ok) {
                    const errorData = await response.json();
                    sendResponse({
                        error: "Error fetching document: " + errorData.error.message,
                    });
                    return;
                }

                const doc = await response.json();
                let text = "";
                if (doc.body && doc.body.content) {
                    doc.body.content.forEach((element: any) => {
                        if (element.paragraph && element.paragraph.elements) {
                            element.paragraph.elements.forEach((el: any) => {
                                if (el.textRun && el.textRun.content) {
                                    text += el.textRun.content;
                                }
                            });
                        }
                    });
                }
                sendResponse({ text });
            } catch (err: any) {
                sendResponse({ error: err.message || String(err) });
            }
        });
    }
});
