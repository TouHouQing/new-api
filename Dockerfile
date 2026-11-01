ARG STUDIO_WEB_BUILD_IMAGE=oven/bun:1.4.0@sha256:5ff609364c049b54eb0ff560ec96319729a972078ef2c755d758f0c6ef89c2d6
ARG STUDIO_GO_BUILD_IMAGE=golang:1.26.1-alpine@sha256:2389ebfa5b7f43eeafbd6be0c3700cc46690ef842ad962f6c5bd6be49ed82039
ARG STUDIO_NODE_BUILD_IMAGE=node:22.19-bookworm-slim
FROM ${STUDIO_NODE_BUILD_IMAGE} AS workbench-node

FROM ${STUDIO_WEB_BUILD_IMAGE} AS builder
COPY --from=workbench-node /usr/local/bin/node /usr/local/bin/node

WORKDIR /build/web
COPY web/package.json web/bun.lock ./
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN bun install --frozen-lockfile --no-cache --registry "${NPM_REGISTRY}"
COPY ./web ./
COPY ./workbench /build/workbench
COPY ./scripts/build-workbench.mjs ./scripts/verify-workbench-assets.mjs /build/scripts/
COPY ./VERSION /build/VERSION
# Workbench dependencies are build-only; avoid committing their files to layers.
RUN --mount=type=tmpfs,target=/build/workbench/web/node_modules,size=3221225472 \
    DISABLE_ESLINT_PLUGIN='true' VITE_REACT_APP_VERSION=$(cat /build/VERSION) bun run build \
    && rm -rf /build/web/node_modules

FROM ${STUDIO_GO_BUILD_IMAGE} AS builder2
ENV GO111MODULE=on CGO_ENABLED=0 GOWORK=off

ARG TARGETOS
ARG TARGETARCH
ENV GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64}
ENV GOEXPERIMENT=greenteagc

WORKDIR /build

ARG GO_BUILD_PROCS=4
ENV GOMAXPROCS=${GO_BUILD_PROCS}
ARG GO_PROXY=https://proxy.golang.org,direct
ENV GOPROXY=${GO_PROXY}

ADD go.mod go.sum ./
# relaykit is a local submodule referenced via replace; its go.mod must be
# present for go mod download to resolve the main module graph.
ADD relaykit/go.mod ./relaykit/go.mod
ADD workbench/backend/go.mod workbench/backend/go.sum ./workbench/backend/
ADD workbench/backend/third_party ./workbench/backend/third_party
RUN go mod download

COPY . .
COPY --from=builder /build/web/dist ./web/dist
COPY --from=builder /build/integrations/studio-agent/schema ./integrations/studio-agent/schema
COPY --from=builder /build/service/resources/studio_previs_worker.js ./service/resources/studio_previs_worker.js
RUN --mount=type=tmpfs,target=/root/.cache/go-build,size=3221225472 \
    --mount=type=tmpfs,target=/tmp,size=3221225472 \
    GOMEMLIMIT=1024MiB GOGC=50 go build -p "${GO_BUILD_PROCS}" -ldflags "-s -w -X 'github.com/QuantumNous/new-api/common.Version=$(cat VERSION)'" -o new-api

FROM debian:bookworm-slim@sha256:f06537653ac770703bc45b4b113475bd402f451e85223f0f2837acbf89ab020a

ARG DEBIAN_MIRROR=http://deb.debian.org
# Bootstrap HTTPS package transport from the pinned build image's trusted CA
# bundle; Debian's signed Release metadata and package digests still apply.
COPY --from=builder2 /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
RUN sed -i "s|http://deb.debian.org|${DEBIAN_MIRROR}|g" /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tzdata libasan8 wget ffmpeg fonts-noto-cjk python3 python3-venv chromium \
    && rm -rf /var/lib/apt/lists/* \
    && update-ca-certificates

RUN python3 -m venv /opt/studio-editorial \
    && /opt/studio-editorial/bin/pip install --no-cache-dir opentimelineio==0.18.1 otio-fcp-adapter==1.0.0 otio-fcpx-xml-adapter==1.0.0

COPY --from=workbench-node /usr/local/bin/node /usr/local/bin/node
COPY --from=workbench-node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm
COPY --from=builder2 /build/new-api /
COPY --from=builder /build/workbench/backend/agent-runtime/pi /opt/yingce/agent-runtime/pi
COPY --from=builder /build/workbench/plugin-packages /opt/yingce/plugin-packages
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN cd /opt/yingce/agent-runtime/pi && npm ci --registry "${NPM_REGISTRY}" --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
ENV CANVAS_PI_RUNTIME_DIR=/opt/yingce/agent-runtime/pi CANVAS_OFFICIAL_PLUGIN_DIR=/opt/yingce/plugin-packages WORKBENCH_DATA_DIR=/data/workbench
COPY LICENSE NOTICE THIRD-PARTY-LICENSES.md /licenses/
COPY workbench/LICENSE /licenses/workbench-LICENSE
COPY workbench/NOTICE /licenses/workbench-NOTICE
COPY workbench/LICENSES /licenses/workbench-components/
EXPOSE 3000
WORKDIR /data
ENTRYPOINT ["/new-api"]
