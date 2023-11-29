function waitForSelector(selector, options = {}) {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearInterval(interval);

        if (options.hidden) {
          const waitForHiddenInterval = setInterval(() => {
            const el = document.querySelector(selector);
            if (
              !el ||
              el?.computedStyleMap()?.get("display")?.value === "none" ||
              el?.computedStyleMap()?.get("visibility")?.value === "hidden"
            ) {
              clearInterval(waitForHiddenInterval);
              return resolve(true);
            }
          });
        } else {
          return resolve(el);
        }
      }
    }, 100);
  });
}

async function getAllTransactions() {
  const els = Array.from(
    document.querySelectorAll('[class*="apx-transaction"]')
  );

  const transactions = [];
  let transactionDate;

  els.forEach((el) => {
    if (el.classList.contains("apx-transaction-date-container")) {
      transactionDate = el?.textContent;
      return;
    }

    if (
      el.classList.contains("apx-transactions-line-item-component-container")
    ) {
      const rows = el.querySelectorAll(".a-row");

      transactions.push({
        transactionDate,
        paymentMethod: rows[0].querySelectorAll(".a-column")[0]?.textContent,
        amount: rows[0].querySelectorAll(".a-column")[1]?.textContent,
        orderLink: rows[1].querySelector(".a-column a")?.href,
        orderNumber: rows[1]
          .querySelector(".a-column")
          ?.textContent?.replace("Order #", ""),
      });
    }
  });

  return transactions.map((t) => ({
    ...t,
    transactionDate: new Date(t.transactionDate),
    amountMilli: Math.floor(parseFloat(t.amount.replace("$", "")) * 1000),
  }));
}

async function getTransactionsBetweenDates(startDate, endDate = new Date()) {
  await waitForSelector(".pmts-portal-component");

  let earliestDate, latestDate;

  const updatePageDateRange = async () => {
    const transactionDateStrings = Array.from(
      document.querySelectorAll(".apx-transaction-date-container")
    ).map((el) => el.textContent);

    earliestDate = new Date(transactionDateStrings.at(-1));
    latestDate = new Date(transactionDateStrings[0]);
  };

  await updatePageDateRange();

  const getNextTransactionPage = async () => {
    document.querySelector('[name*="DefaultNextPageNavigationEvent"]').click();
    await waitForSelector(".pmts-loading-async-widget-spinner-overlay", {
      hidden: true,
    });

    await updatePageDateRange();
  };

  while (earliestDate > endDate) {
    await getNextTransactionPage();
  }

  let fetchedTransactions = [];

  while (latestDate > startDate) {
    const txs = await getAllTransactions();
    fetchedTransactions = [...fetchedTransactions, ...txs];

    await getNextTransactionPage();
  }

  // Limit to desired time range
  fetchedTransactions = fetchedTransactions.filter(
    (tx) => tx.transactionDate > startDate && tx.transactionDate < endDate
  );

  const savedTransactions = await chrome.storage.local.get("transactions");

  // Save to local storage
  await chrome.storage.local.set({
    transactions: {
      ...savedTransactions,
      ...fetchedTransactions.reduce((acc, tx) => {
        acc[tx.orderNumber] = tx;
        return acc;
      }, {}),
    },
  });
}

getTransactionsBetweenDates(new Date("October 1, 2023"));
