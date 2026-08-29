const express = require("express");
const path = require("path");
const crypto = require("crypto");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const { createClient } = require("@supabase/supabase-js");

const app = express();

const PORT = Number(process.env.PORT) || 3000;
const SITE_URL = process.env.SITE_URL || "https://hello-bikes.com";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || "")
  .trim()
  .toLowerCase();

const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "");

const SESSION_SECRET =
  process.env.SESSION_SECRET || "CHANGE_THIS_SECRET_IN_RENDER";

const SESSION_DURATION = 8 * 60 * 60 * 1000;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY.");
  process.exit(1);
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SECRET_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

const publicPath = path.join(__dirname, "public");
const indexPath = path.join(publicPath, "index.html");

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

app.use(
  cors({
    origin: SITE_URL,
    credentials: true
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(cookieParser());

app.use(express.static(publicPath));

function sendError(res, status, message) {
  return res.status(status).json({
    ok: false,
    error: String(message || "Request failed.")
  });
}

function createReferralCode() {
  return crypto.randomBytes(5).toString("hex").toUpperCase();
}

function signValue(value) {
  return crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(value)
    .digest("hex");
}

function createSessionToken(userId, role) {
  const payload = Buffer.from(
    JSON.stringify({
      userId: String(userId),
      role: String(role),
      createdAt: Date.now()
    })
  ).toString("base64url");

  return `${payload}.${signValue(payload)}`;
}

function verifySessionToken(token) {
  if (!token) return null;

  const parts = String(token).split(".");

  if (parts.length !== 2) return null;

  const payload = parts[0];
  const signature = parts[1];
  const expected = signValue(payload);

  const receivedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (receivedBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (
    !crypto.timingSafeEqual(
      receivedBuffer,
      expectedBuffer
    )
  ) {
    return null;
  }

  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );

    if (!data.userId || !data.role || !data.createdAt) {
      return null;
    }

    const age = Date.now() - Number(data.createdAt);

    if (!Number.isFinite(age) || age < 0 || age > SESSION_DURATION) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

function setCookie(res, name, userId, role) {
  res.cookie(
    name,
    createSessionToken(userId, role),
    {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: SESSION_DURATION,
      path: "/"
    }
  );
}

function clearCookie(res, name) {
  res.clearCookie(name, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/"
  });
}

async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  return data || null;
}

function publicProfile(profile) {
  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name || "",
    phone: profile.phone || "",
    country: profile.country || "",
    referral_code: profile.referral_code || "",
    role: profile.role || "user",
    kyc_status: profile.kyc_status || "pending"
  };
}

async function requireCustomer(req, res, next) {
  try {
    const session = verifySessionToken(
      req.cookies.hellobikes_session
    );

    if (!session || session.role !== "user") {
      return sendError(
        res,
        401,
        "Please log in first."
      );
    }

    const profile = await getProfile(session.userId);

    if (!profile) {
      return sendError(
        res,
        401,
        "User profile was not found."
      );
    }

    req.user = profile;

    next();
  } catch (error) {
    console.error("Customer authentication:", error);
    return sendError(
      res,
      401,
      "Authentication failed."
    );
  }
}

function requireAdmin(req, res, next) {
  const session = verifySessionToken(
    req.cookies.hellobikes_admin
  );

  if (!session || session.role !== "admin") {
    return sendError(
      res,
      401,
      "Administrator authentication required."
    );
  }

  if (
    String(session.userId).toLowerCase() !==
    ADMIN_EMAIL
  ) {
    return sendError(
      res,
      401,
      "Invalid administrator session."
    );
  }

  next();
}

/* =========================================================
   HEALTH
========================================================= */

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "HelloBikes API",
    status: "running"
  });
});

/* =========================================================
   DATABASE TEST
========================================================= */

app.get("/api/db-test", async (req, res) => {
  try {
    const { error } = await supabase
      .from("bike_packages")
      .select("id")
      .limit(1);

    if (error) {
      return sendError(
        res,
        500,
        error.message
      );
    }

    res.json({
      ok: true,
      database: "connected"
    });
  } catch (error) {
    return sendError(
      res,
      500,
      error.message
    );
  }
});

/* =========================================================
   PACKAGES
========================================================= */

app.get("/api/packages", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("bike_packages")
      .select(
        "id,name,price,amount_usd,status"
      )
      .eq("status", "active")
      .order("price", {
        ascending: true
      });

    if (error) {
      console.error("Packages:", error);

      return sendError(
        res,
        500,
        error.message
      );
    }

    res.json({
      ok: true,
      packages: data || []
    });
  } catch (error) {
    return sendError(
      res,
      500,
      error.message
    );
  }
});

/* =========================================================
   REGISTER
========================================================= */

app.post("/api/auth/register", async (req, res) => {
  try {
    const {
      email,
      password,
      full_name,
      phone,
      country,
      referral_code
    } = req.body;

    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

    const userPassword = String(password || "");

    const fullName = String(full_name || "").trim();

    if (!normalizedEmail || !userPassword || !fullName) {
      return sendError(
        res,
        400,
        "Name, email and password are required."
      );
    }

    if (userPassword.length < 8) {
      return sendError(
        res,
        400,
        "Password must contain at least 8 characters."
      );
    }

    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existing) {
      return sendError(
        res,
        409,
        "An account with this email already exists."
      );
    }

    const passwordHash = await bcrypt.hash(
      userPassword,
      12
    );

    let referralCode = createReferralCode();

    for (let i = 0; i < 10; i++) {
      const { data: codeExists } = await supabase
        .from("profiles")
        .select("id")
        .eq("referral_code", referralCode)
        .maybeSingle();

      if (!codeExists) break;

      referralCode = createReferralCode();
    }

    const { data: authUser, error: authError } =
      await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password: userPassword,
        email_confirm: true
      });

    if (authError) {
      throw authError;
    }

    const { data: profile, error: profileError } =
      await supabase
        .from("profiles")
        .insert({
          id: authUser.user.id,
          email: normalizedEmail,
          full_name: fullName,
          phone: phone ? String(phone).trim() : null,
          country: country ? String(country).trim() : null,
          referral_code: referralCode,
          role: "user",
          kyc_status: "pending"
        })
        .select()
        .single();

    if (profileError) {
      await supabase.auth.admin.deleteUser(
        authUser.user.id
      );

      throw profileError;
    }

    const { error: walletError } = await supabase
      .from("wallets")
      .insert({
        user_id: authUser.user.id,
        balance_usd: 0,
        earnings_usd: 0,
        referral_earnings_usd: 0
      });

    if (walletError) {
      console.error(
        "Wallet creation:",
        walletError.message
      );
    }

    const suppliedReferral = String(
      referral_code || ""
    ).trim();

    if (suppliedReferral) {
      const { data: referrer } = await supabase
        .from("profiles")
        .select("id")
        .eq(
          "referral_code",
          suppliedReferral
        )
        .maybeSingle();

      if (
        referrer &&
        referrer.id !== authUser.user.id
      ) {
        await supabase
          .from("profiles")
          .update({
            referred_by: referrer.id
          })
          .eq(
            "id",
            authUser.user.id
          );

        await supabase
          .from("referrals")
          .insert({
            referrer_id: referrer.id,
            referred_user_id: authUser.user.id,
            level: 1,
            reward_usd: 0,
            status: "pending"
          });
      }
    }

    setCookie(
      res,
      "hellobikes_session",
      authUser.user.id,
      "user"
    );

    res.status(201).json({
      ok: true,
      message: "Account created successfully.",
      user: publicProfile(profile)
    });
  } catch (error) {
    console.error("Registration:", error);

    return sendError(
      res,
      500,
      error.message
    );
  }
});

/* =========================================================
   LOGIN
========================================================= */

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const password = String(
      req.body.password || ""
    );

    if (!email || !password) {
      return sendError(
        res,
        400,
        "Email and password are required."
      );
    }

    const { data: profile, error } =
      await supabase
        .from("profiles")
        .select("*")
        .eq("email", email)
        .maybeSingle();

    if (error) throw error;

    if (!profile) {
      return sendError(
        res,
        401,
        "Invalid email or password."
      );
    }

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email,
        password
      });

    if (authError || !authData.user) {
      return sendError(
        res,
        401,
        "Invalid email or password."
      );
    }

    setCookie(
      res,
      "hellobikes_session",
      profile.id,
      "user"
    );

    res.json({
      ok: true,
      message: "Login successful.",
      user: publicProfile(profile)
    });
  } catch (error) {
    console.error("Login:", error);

    return sendError(
      res,
      500,
      error.message
    );
  }
});

/* =========================================================
   SESSION
========================================================= */

app.get(
  "/api/auth/session",
  requireCustomer,
  (req, res) => {
    res.json({
      ok: true,
      authenticated: true,
      user: publicProfile(req.user)
    });
  }
);

/* =========================================================
   LOGOUT
========================================================= */

app.post("/api/auth/logout", (req, res) => {
  clearCookie(
    res,
    "hellobikes_session"
  );

  res.json({
    ok: true
  });
});

/* =========================================================
   WALLET
========================================================= */

app.get(
  "/api/wallet",
  requireCustomer,
  async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("wallets")
        .select("*")
        .eq(
          "user_id",
          req.user.id
        )
        .maybeSingle();

      if (error) throw error;

      res.json({
        ok: true,
        wallet: data || {
          balance_usd: 0,
          earnings_usd: 0,
          referral_earnings_usd: 0
        }
      });
    } catch (error) {
      return sendError(
        res,
        500,
        error.message
      );
    }
  }
);

/* =========================================================
   ORDERS
========================================================= */

app.get(
  "/api/orders",
  requireCustomer,
  async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "*,bike_packages(*)"
        )
        .eq(
          "user_id",
          req.user.id
        )
        .order("created_at", {
          ascending: false
        });

      if (error) throw error;

      res.json({
        ok: true,
        orders: data || []
      });
    } catch (error) {
      return sendError(
        res,
        500,
        error.message
      );
    }
  }
);

/* =========================================================
   CREATE ORDER
========================================================= */

app.post(
  "/api/orders",
  requireCustomer,
  async (req, res) => {
    try {
      const packageId = Number(
        req.body.package_id
      );

      const fulfillment =
        req.body.fulfillment === "delivery"
          ? "delivery"
          : "rental";

      if (!Number.isInteger(packageId)) {
        return sendError(
          res,
          400,
          "A valid package is required."
        );
      }

      const { data: packageData, error: packageError } =
        await supabase
          .from("bike_packages")
          .select(
            "id,name,price,amount_usd,status"
          )
          .eq("id", packageId)
          .eq("status", "active")
          .single();

      if (packageError || !packageData) {
        return sendError(
          res,
          404,
          "Package not found."
        );
      }

      const amount = Number(
        packageData.amount_usd
      );

      const { data, error } = await supabase
        .from("orders")
        .insert({
          user_id: req.user.id,
          package_id: packageData.id,
          fulfillment,
          amount_usd: amount,
          status: "pending"
        })
        .select(
          "*,bike_packages(*)"
        )
        .single();

      if (error) throw error;

      res.status(201).json({
        ok: true,
        message: "Order created.",
        order: data
      });
    } catch (error) {
      return sendError(
        res,
        500,
        error.message
      );
    }
  }
);

/* =========================================================
   DEPOSIT REQUEST
========================================================= */

app.post(
  "/api/deposits",
  requireCustomer,
  async (req, res) => {
    try {
      const network =
        req.body.network === "BEP20"
          ? "BEP20"
          : req.body.network === "TRC20"
            ? "TRC20"
            : null;

      const amount = Number(
        req.body.amount_usd
      );

      const txHash = String(
        req.body.tx_hash || ""
      ).trim();

      if (!network) {
        return sendError(
          res,
          400,
          "Choose TRC20 or BEP20."
        );
      }

      if (
        !Number.isFinite(amount) ||
        amount < 10
      ) {
        return sendError(
          res,
          400,
          "Minimum deposit is $10."
        );
      }

      const { data, error } = await supabase
        .from("deposits")
        .insert({
          user_id: req.user.id,
          network,
          amount_usd: amount,
          tx_hash: txHash || null,
          status: "pending"
        })
        .select()
        .single();

      if (error) throw error;

      res.status(201).json({
        ok: true,
        message:
          "Deposit submitted for verification.",
        deposit: data
      });
    } catch (error) {
      return sendError(
        res,
        500,
        error.message
      );
    }
  }
);

/* =========================================================
   WITHDRAWAL REQUEST
========================================================= */

app.post(
  "/api/withdrawals",
  requireCustomer,
  async (req, res) => {
    try {
      const network =
        req.body.network === "BEP20"
          ? "BEP20"
          : req.body.network === "TRC20"
            ? "TRC20"
            : null;

      const amount = Number(
        req.body.amount_usd
      );

      const destination = String(
        req.body.destination || ""
      ).trim();

      if (!network) {
        return sendError(
          res,
          400,
          "Choose TRC20 or BEP20."
        );
      }

      if (
        !Number.isFinite(amount) ||
        amount < 50 ||
        amount > 50000
      ) {
        return sendError(
          res,
          400,
          "Withdrawal must be between $50 and $50,000."
        );
      }

      if (!destination) {
        return sendError(
          res,
          400,
          "Wallet destination is required."
        );
      }

      const fee = Number(
        (amount * 0.15).toFixed(2)
      );

      const netAmount = Number(
        (amount - fee).toFixed(2)
      );

      const { data, error } = await supabase
        .from("withdrawals")
        .insert({
          user_id: req.user.id,
          network,
          amount_usd: amount,
          destination,
          fee_usd: fee,
          net_amount_usd: netAmount,
          status: "pending"
        })
        .select()
        .single();

      if (error) throw error;

      res.status(201).json({
        ok: true,
        message:
          "Withdrawal submitted.",
        withdrawal: data
      });
    } catch (error) {
      return sendError(
        res,
        500,
        error.message
      );
    }
  }
);

/* =========================================================
   KYC
========================================================= */

app.post(
  "/api/kyc",
  requireCustomer,
  async (req, res) => {
    try {
      const {
        full_name,
        country,
        document_type,
        document_number
      } = req.body;

      if (
        !full_name ||
        !country ||
        !document_type ||
        !document_number
      ) {
        return sendError(
          res,
          400,
          "Complete all KYC fields."
        );
      }

      const { data, error } = await supabase
        .from("kyc_submissions")
        .upsert(
          {
            user_id: req.user.id,
            full_name: String(full_name).trim(),
            country: String(country).trim(),
            document_type: String(document_type).trim(),
            document_number: String(document_number).trim(),
            status: "pending",
            submitted_at: new Date().toISOString()
          },
          {
            onConflict: "user_id"
          }
        )
        .select()
        .single();

      if (error) throw error;

      await supabase
        .from("profiles")
        .update({
          kyc_status: "submitted"
        })
        .eq(
          "id",
          req.user.id
        );

      res.status(201).json({
        ok: true,
        message:
          "KYC submitted for review.",
        kyc: data
      });
    } catch (error) {
      return sendError(
        res,
        500,
        error.message
      );
    }
  }
);

/* =========================================================
   REFERRALS
========================================================= */

app.get(
  "/api/referrals",
  requireCustomer,
  async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("referrals")
        .select(
          "*,referred_user:profiles!referrals_referred_user_id_fkey(id,email,full_name,created_at)"
        )
        .eq(
          "referrer_id",
          req.user.id
        )
        .order("created_at", {
          ascending: false
        });

      if (error) throw error;

      res.json({
        ok: true,
        referral_code:
          req.user.referral_code,
        commission_rates: {
          level_1: 10,
          level_2: 3,
          level_3: 2
        },
        referrals: data || []
      });
    } catch (error) {
      return sendError(
        res,
        500,
        error.message
      );
    }
  }
);

/* =========================================================
   ADMIN LOGIN
========================================================= */

app.post(
  "/api/admin/login",
  (req, res) => {
    const email = String(
      req.body.email || ""
    )
      .trim()
      .toLowerCase();

    const password = String(
      req.body.password || ""
    );

    if (
      !ADMIN_EMAIL ||
      !ADMIN_PASSWORD
    ) {
      return sendError(
        res,
        500,
        "Admin credentials are not configured."
      );
    }

    if (
      email !== ADMIN_EMAIL ||
      password !== ADMIN_PASSWORD
    ) {
      return sendError(
        res,
        401,
        "Invalid administrator credentials."
      );
    }

    setCookie(
      res,
      "hellobikes_admin",
      ADMIN_EMAIL,
      "admin"
    );

    res.json({
      ok: true,
      message: "Admin login successful."
    });
  }
);

/* =========================================================
   ADMIN LOGOUT
========================================================= */

app.post(
  "/api/admin/logout",
  (req, res) => {
    clearCookie(
      res,
      "hellobikes_admin"
    );

    res.json({
      ok: true
    });
  }
);

/* =========================================================
   ADMIN STATS
========================================================= */

app.get(
  "/api/admin/stats",
  requireAdmin,
  async (req, res) => {
    try {
      const tables = [
        "profiles",
        "bike_packages",
        "orders",
        "rentals",
        "deposits",
        "withdrawals",
        "kyc_submissions",
        "referrals"
      ];

      const stats = {};

      for (const table of tables) {
        const { count, error } =
          await supabase
            .from(table)
            .select("id", {
              count: "exact",
              head: true
            });

        stats[table] =
          error ? 0 : count || 0;
      }

      res.json({
        ok: true,
        stats
      });
    } catch (error) {
      return sendError(
        res,
        500,
        error.message
      );
    }
  }
);

/* =========================================================
   ADMIN TABLES
========================================================= */

const adminTables = [
  "profiles",
  "wallets",
  "bike_packages",
  "orders",
  "rentals",
  "deposits",
  "withdrawals",
  "kyc_submissions",
  "referrals",
  "referral_rewards",
  "daily_rewards",
  "transactions"
];

for (const table of adminTables) {
  app.get(
    `/api/admin/${table}`,
    requireAdmin,
    async (req, res) => {
      try {
        const { data, error } =
          await supabase
            .from(table)
            .select("*")
            .order("created_at", {
              ascending: false
            });

        if (error) throw error;

        res.json({
          ok: true,
          data: data || []
        });
      } catch (error) {
        return sendError(
          res,
          500,
          error.message
        );
      }
    }
  );
}

/* =========================================================
   API 404
========================================================= */

app.use(
  "/api",
  (req, res) => {
    sendError(
      res,
      404,
      "API endpoint not found."
    );
  }
);

/* =========================================================
   HOMEPAGE
========================================================= */

app.get("/", (req, res) => {
  res.sendFile(indexPath);
});

/* =========================================================
   SPA FALLBACK
========================================================= */

app.get(
  "/{*splat}",
  (req, res, next) => {
    if (req.path.startsWith("/api/")) {
      return next();
    }

    res.sendFile(indexPath);
  }
);

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
  (error, req, res, next) => {
    console.error(
      "Unhandled server error:",
      error
    );

    if (res.headersSent) {
      return next(error);
    }

    sendError(
      res,
      500,
      "Internal server error."
    );
  }
);

/* =========================================================
   START SERVER
========================================================= */

const server = app.listen(
  PORT,
  () => {
    console.log(
      "========================================"
    );
    console.log(
      "          HELLOBikes API"
    );
    console.log(
      "========================================"
    );
    console.log(
      "Port:",
      PORT
    );
    console.log(
      "Supabase:",
      "connected"
    );
    console.log(
      "Website:",
      SITE_URL
    );
    console.log(
      "========================================"
    );
  }
);

server.on(
  "error",
  (error) => {
    console.error(
      "Server startup error:",
      error
    );

    process.exit(1);
  }
);
