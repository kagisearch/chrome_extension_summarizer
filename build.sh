#!/usr/bin/env bash
set -xeou pipefail

version="$(jq -r .version <manifest.json)"
inputs=(icons manifest.json service_worker.js popup.{css,html,js} summarize_popup.{css,html,js})
output="kagi_chrome_summarizer_${version}.zip"
unpacked_dir="unpacked"

rm -f "$output"
zip -r "$output" "${inputs[@]}"

# test from this dir to ensure full asset capture
rm -rf "$unpacked_dir"
unzip -d "$unpacked_dir" "$output"
