// const observeUrlChange = () => {
//   let oldHref = document.location.href;
//   const body = document.querySelector("body");
//   const observer = new MutationObserver((mutations) => {
//     if (oldHref !== document.location.href) {
//       oldHref = document.location.href;
//       console.log("url changed!", document.location.href);
//     }
//   });
//   observer.observe(body, { childList: true, subtree: true });
// };

// window.onload = observeUrlChange;

// TODO: Detect when we're on the Amazon payment card accounts page
// TODO: Add "Sync" button to UI

function handleImportClick() {
  console.log("importing from amazon");
  chrome.runtime.sendMessage({ import: "import" }, (response) => {
    console.log(response);
  });
}

const mo = new MutationObserver((mutations, observer) => {
  mutations.forEach((mutation) => {
    if (mutation.addedNodes.length > 0) {
      for (const node of mutation.addedNodes) {
        if (node.classList?.contains("reconcile-button-and-label")) {
          console.log(node);

          const importButton = document.createElement("button");
          importButton.innerText = "Import from Amazon";
          importButton.classList.add("ynab-button", "secondary");
          importButton.onclick = handleImportClick;

          node.prepend(importButton);
        }
      }
    }
  });
});

mo.observe(document.body, {
  childList: true,
  subtree: true,
});
