#!/usr/bin/env node
import { main } from "../src/index.js";

main(process.argv).then((code) => {
  process.exit(code);
});
