const express = require("express");
const cookieParser = require("cookie-parser");
const { createClient } = require("@supabase/supabase-js");

const router = express.Router();

/* =========================================================
   SUPABASE CONFIGURATION
========================================================= */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY;

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL) {
  throw new Error("Missing SUPABASE_URL");
}

if (!SUPABASE_SECRET_KEY) {
  throw new Error("Missing SUPABASE_SECRET_KEY");
}

if (!SUPABASE_ANON_KEY) {
  throw new Error("Missing SUPABASE_ANON_KEY");
}


/* =========================================================
   SERVER SUPABASE CLIENT
   Uses the secret/service key.
   NEVER expose this client to the browser.
========================================================= */

const supabaseAdmin =
  createClient(
    SUPABASE_URL,
    SUPABASE_SECRET_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );


/* =========================================================
   AUTH CLIENT
   Uses the public anon key for password authentication.
========================================================= */

function createAuthClient() {

  return createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );

}


/* =========================================================
   COOKIE CONFIGURATION
========================================================= */

const COOKIE_NAME =
  "hellobikes_access_token";


router.use(
  cookieParser()
);


/* =========================================================
   REGISTER
   POST /api/auth/register
========================================================= */

router.post(
  "/register",
  async (req, res) => {

    try {

      const {
        full_name,
        email,
        phone,
        country,
        referral_code,
        password
      } = req.body || {};


      /* -----------------------------------------------------
         VALIDATION
      ----------------------------------------------------- */

      if (!full_name) {

        return res.status(400).json({
          ok: false,
          message: "Full name is required."
        });

      }


      if (!email) {

        return res.status(400).json({
          ok: false,
          message: "Email is required."
        });

      }


      if (!phone) {

        return res.status(400).json({
          ok: false,
          message: "Phone number is required."
        });

      }


      if (!country) {

        return res.status(400).json({
          ok: false,
          message: "Country is required."
        });

      }


      if (!password || password.length < 8) {

        return res.status(400).json({
          ok: false,
          message:
            "Password must contain at least 8 characters."
        });

      }


      /* -----------------------------------------------------
         CREATE SUPABASE AUTH USER
      ----------------------------------------------------- */

      const {
        data,
        error
      } =
        await supabaseAdmin.auth.admin.createUser({

          email: email.trim().toLowerCase(),

          password,

          email_confirm: false,

          user_metadata: {
            full_name:
              full_name.trim(),

            phone:
              phone.trim(),

            country:
              country.trim(),

            referral_code:
              referral_code
                ? referral_code.trim()
                : null
          }

        });


      if (error) {

        console.error(
          "Supabase registration error:",
          error
        );

        return res.status(400).json({
          ok: false,
          message:
            error.message ||
            "Unable to create account."
        });

      }


      /* -----------------------------------------------------
         OPTIONAL PROFILE CREATION
         
         This attempts to create the profile only if
         the profiles table has these columns.
         
         If your database schema is different, we will
         adjust this when we build the database layer.
      ----------------------------------------------------- */

      let profileCreated = false;

      try {

        const {
          error: profileError
        } =
          await supabaseAdmin
            .from("profiles")
            .insert({

              id: data.user.id,

              full_name:
                full_name.trim(),

              email:
                email.trim().toLowerCase(),

              phone:
                phone.trim(),

              country:
                country.trim(),

              referral_code:
                referral_code
                  ? referral_code.trim()
                  : null

            });


        if (!profileError) {

          profileCreated = true;

        } else {

          console.warn(
            "Profile was not created:",
            profileError.message
          );

        }

      } catch (profileError) {

        console.warn(
          "Profile creation skipped:",
          profileError.message
        );

      }


      /* -----------------------------------------------------
         RESPONSE
      ----------------------------------------------------- */

      return res.status(201).json({

        ok: true,

        message:
          "Account created successfully. Please verify your email before signing in.",

        user: {
          id: data.user.id,
          email: data.user.email
        },

        profile_created:
          profileCreated

      });

    } catch (error) {

      console.error(
        "Registration server error:",
        error
      );

      return res.status(500).json({

        ok: false,

        message:
          "Unable to create account."

      });

    }

  }
);


/* =========================================================
   LOGIN
   POST /api/auth/login
========================================================= */

router.post(
  "/login",
  async (req, res) => {

    try {

      const {
        email,
        password
      } = req.body || {};


      if (!email) {

        return res.status(400).json({
          ok: false,
          message: "Email is required."
        });

      }


      if (!password) {

        return res.status(400).json({
          ok: false,
          message: "Password is required."
        });

      }


      /* -----------------------------------------------------
         AUTHENTICATE WITH SUPABASE
      ----------------------------------------------------- */

      const supabaseAuth =
        createAuthClient();


      const {
        data,
        error
      } =
        await supabaseAuth.auth.signInWithPassword({

          email:
            email.trim().toLowerCase(),

          password

        });


      if (error) {

        console.error(
          "Login error:",
          error.message
        );

        return res.status(401).json({

          ok: false,

          message:
            "Invalid email or password."

        });

      }


      if (!data.session) {

        return res.status(401).json({

          ok: false,

          message:
            "Unable to create login session."

        });

      }


      /* -----------------------------------------------------
         STORE ACCESS TOKEN IN HTTP-ONLY COOKIE
      ----------------------------------------------------- */

      res.cookie(
        COOKIE_NAME,
        data.session.access_token,
        {
          httpOnly: true,

          secure:
            process.env.NODE_ENV ===
            "production",

          sameSite: "lax",

          maxAge:
            1000 *
            60 *
            60 *
            24 *
            7,

          path: "/"
        }
      );


      /* -----------------------------------------------------
         RESPONSE
      ----------------------------------------------------- */

      return res.json({

        ok: true,

        message:
          "Login successful.",

        user: {

          id:
            data.user.id,

          email:
            data.user.email,

          email_confirmed:
            Boolean(
              data.user.email_confirmed_at
            )

        }

      });

    } catch (error) {

      console.error(
        "Login server error:",
        error
      );

      return res.status(500).json({

        ok: false,

        message:
          "Unable to sign in."

      });

    }

  }
);


/* =========================================================
   CURRENT USER
   GET /api/auth/me
========================================================= */

router.get(
  "/me",
  async (req, res) => {

    try {

      const token =
        req.cookies[COOKIE_NAME];


      if (!token) {

        return res.status(401).json({

          ok: false,

          message:
            "Not authenticated."

        });

      }


      const {
        data,
        error
      } =
        await supabaseAdmin.auth.getUser(
          token
        );


      if (
        error ||
        !data ||
        !data.user
      ) {

        return res.status(401).json({

          ok: false,

          message:
            "Session expired."

        });

      }


      return res.json({

        ok: true,

        user: {

          id:
            data.user.id,

          email:
            data.user.email,

          full_name:
            data.user.user_metadata
              ?.full_name || "",

          phone:
            data.user.user_metadata
              ?.phone || "",

          country:
            data.user.user_metadata
              ?.country || ""

        }

      });

    } catch (error) {

      console.error(
        "Current user error:",
        error
      );

      return res.status(500).json({

        ok: false,

        message:
          "Unable to retrieve account."

      });

    }

  }
);


/* =========================================================
   LOGOUT
   POST /api/auth/logout
========================================================= */

router.post(
  "/logout",
  async (req, res) => {

    try {

      const token =
        req.cookies[COOKIE_NAME];


      /*
        The browser cookie is the primary session
        credential for this application.
      */

      if (token) {

        try {

          await supabaseAdmin.auth.admin.signOut(
            token
          );

        } catch (error) {

          /*
            Even if Supabase rejects the token,
            continue clearing the browser cookie.
          */

          console.warn(
            "Supabase signout warning:",
            error.message
          );

        }

      }


      res.clearCookie(
        COOKIE_NAME,
        {
          httpOnly: true,

          secure:
            process.env.NODE_ENV ===
            "production",

          sameSite: "lax",

          path: "/"
        }
      );


      return res.json({

        ok: true,

        message:
          "Logged out successfully."

      });

    } catch (error) {

      console.error(
        "Logout error:",
        error
      );

      res.clearCookie(
        COOKIE_NAME,
        {
          path: "/"
        }
      );

      return res.json({

        ok: true,

        message:
          "Logged out."

      });

    }

  }
);


/* =========================================================
   PASSWORD RESET
   POST /api/auth/reset-password
========================================================= */

router.post(
  "/reset-password",
  async (req, res) => {

    try {

      const {
        email
      } = req.body || {};


      if (!email) {

        return res.status(400).json({

          ok: false,

          message:
            "Email is required."

        });

      }


      const supabaseAuth =
        createAuthClient();


      const {
        error
      } =
        await supabaseAuth.auth
          .resetPasswordForEmail(
            email.trim().toLowerCase(),
            {
              redirectTo:
                `${process.env.APP_URL || ""}/reset-password.html`
            }
          );


      if (error) {

        console.error(
          "Password reset error:",
          error.message
        );

        /*
          Do not reveal whether an email exists.
        */

      }


      return res.json({

        ok: true,

        message:
          "If an account exists for that email, password reset instructions will be sent."

      });

    } catch (error) {

      console.error(
        "Password reset server error:",
        error
      );

      return res.json({

        ok: true,

        message:
          "If an account exists for that email, password reset instructions will be sent."

      });

    }

  }
);


/* =========================================================
   AUTHENTICATION MIDDLEWARE
   Used by protected API routes.
========================================================= */

async function requireAuth(
  req,
  res,
  next
) {

  try {

    const token =
      req.cookies[COOKIE_NAME];


    if (!token) {

      return res.status(401).json({

        ok: false,

        message:
          "Authentication required."

      });

    }


    const {
      data,
      error
    } =
      await supabaseAdmin.auth.getUser(
        token
      );


    if (
      error ||
      !data ||
      !data.user
    ) {

      return res.status(401).json({

        ok: false,

        message:
          "Your session has expired. Please log in again."

      });

    }


    req.user =
      data.user;


    next();

  } catch (error) {

    console.error(
      "Authentication middleware error:",
      error
    );

    return res.status(401).json({

      ok: false,

      message:
        "Authentication failed."

    });

  }

}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  router,
  requireAuth,
  COOKIE_NAME
};
