import puppeteer from "puppeteer";
import "dotenv/config";
import { writeFileSync, readFileSync } from "node:fs";

let browser;
let page;

async function setupBrowser() {
  browser = await puppeteer.launch({
    headless: false,
  });

  page = await browser.newPage();
}

export const savedTransactions = {
  read() {
    const savedTransactionsData = readFileSync("./transactions.json");
    return JSON.parse(savedTransactionsData);
  },
  update(newData) {
    writeFileSync(
      "./transactions.json",
      JSON.stringify({ ...this.read(), ...newData }, null, 2)
    );
  },
  updateOne(orderId, tx) {
    writeFileSync(
      "./transactions.json",
      JSON.stringify(
        {
          ...this.read(),
          [orderId]: { ...this.read()[orderId], ...tx },
        },
        null,
        2
      )
    );
  },
};

async function logInToAmazon() {
  await page.goto(
    "https://www.amazon.com/ap/signin?openid.pape.max_auth_age=0&openid.return_to=https%3A%2F%2Fwww.amazon.com%2F%3Fref_%3Dnav_ya_signin&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.assoc_handle=usflex&openid.mode=checkid_setup&openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0"
  );

  await page.locator("#ap_email").fill(process.env.AMAZON_USERNAME);
  await page.locator("#continue").click();

  await page.locator("#ap_password").fill(process.env.AMAZON_PASSWORD);
  await page.locator("#signInSubmit").click();

  await page.waitForNavigation();

  // if (await page.waitForSelector("#ap_email")) {
  //   await page.locator("#ap_email").fill(process.env.AMAZON_USERNAME);
  //   await page.locator("#continue").click();

  //   await page.locator("#ap_password").fill(process.env.AMAZON_PASSWORD);
  //   await page.locator("#signInSubmit").click();
  //   await page.waitForNavigation();
  // }
}

async function getAllTransactions() {
  const tx = await page.$$eval('[class*="apx-transaction"]', (els) => {
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

    return transactions;
  });

  return tx.map((t) => ({
    ...t,
    transactionDate: new Date(t.transactionDate),
    amountMilli: Math.floor(parseFloat(t.amount.replace("$", "")) * 1000),
  }));
}

async function getTransactionsBetweenDates(startDate, endDate = new Date()) {
  await page.goto("https://www.amazon.com/cpe/yourpayments/transactions");

  await page.waitForSelector(".pmts-portal-component");

  let earliestDate, latestDate;

  const updatePageDateRange = async () => {
    const transactionDateStrings = await page.$$eval(
      ".apx-transaction-date-container",
      (els) => els.map((el) => el.textContent)
    );

    earliestDate = new Date(transactionDateStrings.at(-1));
    latestDate = new Date(transactionDateStrings[0]);
  };

  await updatePageDateRange();

  const getNextTransactionPage = async () => {
    await page.locator('[name*="DefaultNextPageNavigationEvent"]').click();
    await page.waitForSelector(".pmts-loading-async-widget-spinner-overlay", {
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

  savedTransactions.update(
    fetchedTransactions.reduce((acc, tx) => {
      acc[tx.orderNumber] = tx;
      return acc;
    }, {})
  );
}

async function getTransactionDetails(orderLink) {
  const orderPage = await browser.newPage();

  await orderPage.goto(orderLink);

  const ORDER_TYPE = {
    PHYSICAL: 0,
    DIGITAL: 1,
    AMAZON_PAY: 2,
  };

  try {
    const orderType = await Promise.any([
      orderPage
        .waitForSelector("#orderDetails")
        .then(() => ORDER_TYPE.PHYSICAL),
      orderPage.waitForSelector(".orderSummary").then(() => ORDER_TYPE.DIGITAL),
      orderPage
        .waitForSelector("#order_details_div")
        .then(() => ORDER_TYPE.AMAZON_PAY),
    ]);

    let items;

    if (orderType === ORDER_TYPE.PHYSICAL) {
      await orderPage.waitForSelector(".yohtmlc-item");

      items = await orderPage.$$eval(".yohtmlc-item", (els) => {
        return els.map((el) => ({
          itemName: el.querySelector("a")?.textContent?.trim(),
          itemCost: Array.from(el.querySelectorAll("div, span"))
            .find(
              (div) => div.textContent.includes("$") && !div.firstElementChild
            )
            ?.textContent.trim()
            .replace("$", ""),
          itemQty: el.previousElementSibling
            ?.querySelector(".item-view-qty")
            ?.textContent?.trim(),
        }));
      });
    } else if (orderType === ORDER_TYPE.DIGITAL) {
      await orderPage.waitForSelector(
        "#digitalOrderSummaryContainer table.sample table table > tbody > tr:not(:first-child):not(:last-child)"
      );

      items = await orderPage.$$eval(
        "#digitalOrderSummaryContainer table.sample table table > tbody > tr:not(:first-child):not(:last-child)",
        (els) =>
          els.map((item) => {
            const rows = item
              .querySelectorAll("td")[0]
              .childNodes.values()
              .toArray()
              .map((e) => e?.textContent.trim());

            return {
              itemName: `${rows[1]} ${rows[2]}`,
              itemQty: rows
                .find((row) => row.includes("Qty: "))
                ?.replace("Qty: ", ""),
              itemCost: item
                .querySelectorAll("td")[1]
                ?.textContent.trim()
                .replace("$", ""),
            };
          })
      );
    }

    await orderPage.close();
    return items;
  } catch (err) {
    console.error(err);
    return;
  }
}

async function getAllTransactionDetails() {
  const savedTransactionsData = savedTransactions.read();

  const transactionsMissingDetails = Object.values(
    savedTransactionsData
  ).filter((tx) => !(tx.items?.length > 0));

  for (const tx of transactionsMissingDetails) {
    if (tx.orderLink) {
      const orderItems = await getTransactionDetails(tx.orderLink);
      savedTransactions.updateOne(tx.orderNumber, { items: orderItems });
    }
  }
}

async function main() {
  await setupBrowser();
  await logInToAmazon();
  await getTransactionsBetweenDates(
    new Date("November 1, 2023", new Date("November 15, 2020"))
  );
  await getAllTransactionDetails();

  //   await getAllTransactions();
  //   const items = await getTransactionDetails(
  //     "https://www.amazon.com/gp/your-account/order-details/ref=_or?ie=UTF8&orderID=111-5818513-7732263"
  //   );

  //   console.log(items);
}

main();
