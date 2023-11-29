chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  console.log(
    sender.tab
      ? "from a content script:" + sender.tab.url
      : "from the extension"
  );
  if (request.import === "import") {
    chrome.tabs.create({
      url: "https://www.amazon.com/cpe/yourpayments/transactions",
    });
    sendResponse({ farewell: "goodbye" });
  }
});
