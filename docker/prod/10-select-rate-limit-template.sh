#!/bin/sh
set -eu

template_dir="/etc/nginx/templates"
rate_limit="${RATE_LIMIT_ENABLED:-1}"

if [ "$rate_limit" = "0" ]; then
  cp "$template_dir/default.no-rate-limit.conf.template" \
    "$template_dir/default.conf.template"
else
  cp "$template_dir/default.rate-limit.conf.template" \
    "$template_dir/default.conf.template"
fi
