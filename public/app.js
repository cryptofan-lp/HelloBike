/* =========================================================
   HELLOBIKES
   FILE 5 — public/app.js
   Frontend application logic
========================================================= */

"use strict";

/* =========================================================
   API CONFIGURATION
========================================================= */

const API_BASE =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? ""
    : "https://hellobike-api.onrender.com";


/* =========================================================
   APPLICATION STATE
========================================================= */

const HelloBikeApp = {
  packages: [],
  selectedPackage: null,
  selectedNetwork: "TRC20",
  user: null,
  loading: false
};


/* =========================================================
   DOM HELPERS
========================================================= */

function $(id) {
  return document.getElementById(id);
}


function showElement(id) {
  const element = $(id);

  if (element) {
    element.style.display = "";
  }
}


function hideElement(id) {
  const element = $(id);

  if (element) {
    element.style.display = "none";
  }
}


/* =========================================================
   API REQUEST HELPER
========================================================= */

async function apiRequest(endpoint, options = {}) {

  const config = {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  };

  if (options.body !== undefined) {
    config.body =
      typeof options.body === "string"
        ? options.body
        : JSON.stringify(options.body);
  }

  const response = await fetch(
    `${API_BASE}${endpoint}`,
    config
  );

  let data = null;

  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }

  if (!response.ok) {

    const message =
      data && data.message
        ? data.message
        : `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return data;
}


/* =========================================================
   HEALTH CHECK
========================================================= */

async function checkApiHealth() {

  try {

    const result =
      await apiRequest("/api/health");

    console.log(
      "HelloBikes API:",
      result
    );

    return result;

  } catch (error) {

    console.error(
      "HelloBikes API health check failed:",
      error
    );

    return null;
  }
}


/* =========================================================
   LOAD BIKE PACKAGES
========================================================= */

async function loadBikePackages() {

  const container =
    $("packageList");

  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="loading">
      Loading bike packages...
    </div>
  `;

  try {

    const result =
      await apiRequest("/api/packages");

    if (
      !result ||
      !Array.isArray(result.packages)
    ) {
      throw new Error(
        "Invalid package response."
      );
    }

    HelloBikeApp.packages =
      result.packages;

    renderBikePackages(
      HelloBikeApp.packages
    );

  } catch (error) {

    console.error(
      "Could not load bike packages:",
      error
    );

    /*
      These values mirror the packages
      stored in the HelloBikes database.

      They are only a frontend fallback
      when the API is temporarily unavailable.
    */

    HelloBikeApp.packages = [
      {
        id: "1",
        name: "1 Bike",
        bikes: 1,
        price: 50,
        amount_usd: 50,
        status: "active"
      },
      {
        id: "2",
        name: "2 Bikes",
        bikes: 2,
        price: 100,
        amount_usd: 100,
        status: "active"
      },
      {
        id: "3",
        name: "4 Bikes",
        bikes: 4,
        price: 200,
        amount_usd: 200,
        status: "active"
      },
      {
        id: "4",
        name: "10 Bikes",
        bikes: 10,
        price: 500,
        amount_usd: 500,
        status: "active"
      },
      {
        id: "5",
        name: "20 Bikes",
        bikes: 20,
        price: 1000,
        amount_usd: 1000,
        status: "active"
      },
      {
        id: "6",
        name: "100 Bikes",
        bikes: 100,
        price: 5000,
        amount_usd: 5000,
        status: "active"
      },
      {
        id: "7",
        name: "200 Bikes",
        bikes: 200,
        price: 10000,
        amount_usd: 10000,
        status: "active"
      },
      {
        id: "8",
        name: "1,000 Bikes",
        bikes: 1000,
        price: 50000,
        amount_usd: 50000,
        status: "active"
      }
    ];

    renderBikePackages(
      HelloBikeApp.packages
    );
  }
}


/* =========================================================
   RENDER BIKE PACKAGES
========================================================= */

function renderBikePackages(packages) {

  const container =
    $("packageList");

  if (!container) {
    return;
  }

  if (!packages.length) {

    container.innerHTML = `
      <div class="loading">
        No bike packages are currently available.
      </div>
    `;

    return;
  }

  container.innerHTML =
    packages
      .map((pkg, index) => {

        const price =
          Number(
            pkg.price ??
            pkg.amount_usd ??
            0
          );

        const bikes =
          Number(pkg.bikes || 0);

        const packageName =
          pkg.name ||
          `${bikes.toLocaleString()} Bike${bikes === 1 ? "" : "s"}`;

        const safeId =
          escapeAttribute(
            String(pkg.id)
          );

        return `
          <article class="package-card">

            <div class="package-image"></div>

            <div class="package-name">
              ${escapeHtml(packageName)}
            </div>

            <div class="package-bikes">
              ${bikes
                ? `${bikes.toLocaleString()} bicycle${bikes === 1 ? "" : "s"}`
                : "Bicycle ownership package"
              }
            </div>

            <div class="package-price">
              $${price.toLocaleString()}
            </div>

            <div class="package-actions">

              <button
                class="package-button"
                data-action="rent"
                data-package-id="${safeId}"
              >
                Rent
              </button>

              <button
                class="package-button buy"
                data-action="buy"
                data-package-id="${safeId}"
              >
                Buy
              </button>

            </div>

          </article>
        `;
      })
      .join("");

  attachPackageButtons();
}


/* =========================================================
   PACKAGE BUTTON EVENTS
========================================================= */

function attachPackageButtons() {

  const buttons =
    document.querySelectorAll(
      "[data-action]"
    );

  buttons.forEach((button) => {

    button.addEventListener(
      "click",
      () => {

        const action =
          button.dataset.action;

        const packageId =
          button.dataset.packageId;

        const selected =
          HelloBikeApp.packages.find(
            (pkg) =>
              String(pkg.id) ===
              String(packageId)
          );

        if (!selected) {

          showMessage(
            "This bike package could not be found."
          );

          return;
        }

        HelloBikeApp.selectedPackage =
          selected;

        if (action === "buy") {

          handleBuyPackage(selected);

        } else if (action === "rent") {

          handleRentPackage(selected);

        }

      }
    );
  });
}


/* =========================================================
   BUY PACKAGE
========================================================= */

function handleBuyPackage(pkg) {

  const price =
    Number(
      pkg.price ??
      pkg.amount_usd ??
      0
    );

  const name =
    pkg.name ||
    "Bike Package";

  showMessage(
    `${name} selected for $${price.toLocaleString()}. Please sign in to continue.`
  );

  openModal("loginModal");
}


/* =========================================================
   RENT PACKAGE
========================================================= */

function handleRentPackage(pkg) {

  const name =
    pkg.name ||
    "Bike Package";

  showMessage(
    `${name} selected for rental. Please sign in to continue.`
  );

  openModal("loginModal");
}


/* =========================================================
   MODAL SYSTEM
========================================================= */

function openModal(id) {

  const modal =
    $(id);

  if (!modal) {
    return;
  }

  modal.classList.add("show");

  document.body.style.overflow =
    "hidden";
}


function closeModal(id) {

  const modal =
    $(id);

  if (!modal) {
    return;
  }

  modal.classList.remove("show");

  document.body.style.overflow =
    "";
}


function closeModalOutside(
  event,
  id
) {

  if (
    event.target &&
    event.target.id === id
  ) {

    closeModal(id);

  }
}


/* =========================================================
   SCROLL
========================================================= */

function scrollToSection(id) {

  const element =
    $(id);

  if (!element) {
    return;
  }

  element.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}


function scrollToTop() {

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


/* =========================================================
   NETWORK SELECTION
========================================================= */

function selectNetwork(network) {

  if (
    network !== "TRC20" &&
    network !== "BEP20"
  ) {

    return;
  }

  HelloBikeApp.selectedNetwork =
    network;

  document
    .querySelectorAll(
      "[data-network]"
    )
    .forEach((element) => {

      element.classList.toggle(
        "active",
        element.dataset.network === network
      );

    });

}


/* =========================================================
   WALLET
========================================================= */

function openWallet() {

  openModal(
    "walletModal"
  );

}


function selectDepositNetwork(network) {

  selectNetwork(network);

}


function selectWithdrawalNetwork(network) {

  selectNetwork(network);

}


/* =========================================================
   DEPOSIT
========================================================= */

function startDeposit() {

  const network =
    HelloBikeApp.selectedNetwork;

  showMessage(
    `USDT deposit selected on ${network}. The secure deposit process will be connected to the backend.`
  );

}


/* =========================================================
   WITHDRAWAL
========================================================= */

function startWithdrawal() {

  const network =
    HelloBikeApp.selectedNetwork;

  showMessage(
    `USDT withdrawal selected on ${network}. Withdrawals are subject to account verification, balance requirements, platform rules and the applicable fee.`
  );

}


/* =========================================================
   LOGIN
========================================================= */

function handleLogin() {

  const email =
    $("loginEmail")
      ? $("loginEmail").value.trim()
      : "";

  const password =
    $("loginPassword")
      ? $("loginPassword").value
      : "";

  if (!email) {

    showMessage(
      "Please enter your email or phone number."
    );

    return;
  }

  if (!password) {

    showMessage(
      "Please enter your password."
    );

    return;
  }

  showMessage(
    "Authentication will be connected to the secure account system."
  );

}


/* =========================================================
   KYC
========================================================= */

function openKyc() {

  showMessage(
    "KYC verification will require the account holder to submit the requested identity information and documents."
  );

}


/* =========================================================
   TWO-STEP VERIFICATION
========================================================= */

function openVerification() {

  showMessage(
    "The two-step verification process will be completed through the secure account system."
  );

}


/* =========================================================
   REFERRALS
========================================================= */

function openReferrals() {

  showMessage(
    "Your referral dashboard will show your referral code, network and eligible referral rewards."
  );

}


/* =========================================================
   SUPPORT
========================================================= */

function openTelegram() {

  showMessage(
    "Telegram support link will be connected here."
  );

}


function openDiscord() {

  showMessage(
    "Discord support link will be connected here."
  );

}


/* =========================================================
   DELIVERY
========================================================= */

function requestDelivery() {

  showMessage(
    "Delivery request selected. Sign in to continue."
  );

  openModal("loginModal");

}


/* =========================================================
   RENTAL
========================================================= */

function openRental() {

  showMessage(
    "Rental service selected. Sign in to continue."
  );

  openModal("loginModal");

}


/* =========================================================
   USER MESSAGE
========================================================= */

function showMessage(message) {

  /*
    Use a simple alert for now.

    This keeps the application functional
    without requiring another library.
  */

  window.alert(message);

}


/* =========================================================
   HTML SECURITY HELPERS
========================================================= */

function escapeHtml(value) {

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


function escapeAttribute(value) {

  return escapeHtml(value);

}


/* =========================================================
   ACTIVE BOTTOM NAVIGATION
========================================================= */

function updateBottomNavigation() {

  const sections = [
    {
      id: null,
      navIndex: 0
    },
    {
      id: "packages",
      navIndex: 1
    },
    {
      id: "services",
      navIndex: 3
    }
  ];

  const navItems =
    document.querySelectorAll(
      ".nav-item"
    );

  if (!navItems.length) {
    return;
  }

  window.addEventListener(
    "scroll",
    () => {

      let current =
        0;

      const scrollPosition =
        window.scrollY + 180;

      sections.forEach(
        (section) => {

          if (!section.id) {
            return;
          }

          const element =
            $(section.id);

          if (
            element &&
            element.offsetTop <=
              scrollPosition
          ) {

            current =
              section.navIndex;

          }

        }
      );

      navItems.forEach(
        (item, index) => {

          item.classList.toggle(
            "active",
            index === current
          );

        }
      );

    }
  );

}


/* =========================================================
   PREVENT MODAL BACKGROUND SCROLL
========================================================= */

document.addEventListener(
  "click",
  (event) => {

    const target =
      event.target;

    if (
      target.classList &&
      target.classList.contains(
        "modal-overlay"
      )
    ) {

      target.classList.remove(
        "show"
      );

      document.body.style.overflow =
        "";

    }

  }
);


/* =========================================================
   ESCAPE KEY
========================================================= */

document.addEventListener(
  "keydown",
  (event) => {

    if (event.key !== "Escape") {
      return;
    }

    document
      .querySelectorAll(
        ".modal-overlay.show"
      )
      .forEach((modal) => {

        modal.classList.remove(
          "show"
        );

      });

    document.body.style.overflow =
      "";

  }
);


/* =========================================================
   INITIALIZE APPLICATION
========================================================= */

async function initializeHelloBikes() {

  console.log(
    "======================================"
  );

  console.log(
    "       HELLOBikes FRONTEND"
  );

  console.log(
    "======================================"
  );

  console.log(
    "API:",
    API_BASE || "same origin"
  );

  await checkApiHealth();

  await loadBikePackages();

  updateBottomNavigation();

  console.log(
    "HelloBikes frontend initialized."
  );

}


/* =========================================================
   START APPLICATION
========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initializeHelloBikes
  );

} else {

  initializeHelloBikes();

}


/* =========================================================
   GLOBAL FUNCTIONS
   These allow existing onclick=""
   attributes in index.html to work.
========================================================= */

window.openModal =
  openModal;

window.closeModal =
  closeModal;

window.closeModalOutside =
  closeModalOutside;

window.scrollToSection =
  scrollToSection;

window.scrollToTop =
  scrollToTop;

window.showMessage =
  showMessage;

window.openWallet =
  openWallet;

window.startDeposit =
  startDeposit;

window.startWithdrawal =
  startWithdrawal;

window.selectNetwork =
  selectNetwork;

window.selectDepositNetwork =
  selectDepositNetwork;

window.selectWithdrawalNetwork =
  selectWithdrawalNetwork;

window.handleLogin =
  handleLogin;

window.openKyc =
  openKyc;

window.openVerification =
  openVerification;

window.openReferrals =
  openReferrals;

window.openTelegram =
  openTelegram;

window.openDiscord =
  openDiscord;

window.requestDelivery =
  requestDelivery;

window.openRental =
  openRental;
