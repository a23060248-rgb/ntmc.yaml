process.env.NODE_ENV = "test";
process.env.ENV_FILE ||= ".env.test";
process.env.DATABASE_SAFETY_MODE ||= "rehearsal";

require("../src/server");
