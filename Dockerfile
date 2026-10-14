ARG STUDIO_WEB_BUILD_IMAGE=oven/bun:1.4.0@sha256:5ff609364c049b54eb0ff560ec96319729a972078ef2c755d758f0c6ef89c2d6
ARG STUDIO_GO_BUILD_IMAGE=golang:1.26.1-alpine@sha256:2389ebfa5b7f43eeafbd6be0c3700cc46690ef842ad962f6c5bd6be49ed82039
FROM ${STUDIO_WEB_BUILD_IMAGE} AS builder

WORKDIR /build/web
COPY web/package.json web/bun.lock ./
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN bun install --frozen-lockfile --registry "${NPM_REGISTRY}"
COPY ./web ./
COPY ./VERSION /build/VERSION
RUN DISABLE_ESLINT_PLUGIN='true' VITE_REACT_APP_VERSION=$(cat /build/VERSION) bun run build

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
RUN go mod download

COPY . .
COPY --from=builder /build/web/dist ./web/dist
COPY --from=builder /build/integrations/studio-agent/schema ./integrations/studio-agent/schema
COPY --from=builder /build/service/resources/studio_previs_worker.js ./service/resources/studio_previs_worker.js
RUN go build -ldflags "-s -w -X 'github.com/QuantumNous/new-api/common.Version=$(cat VERSION)'" -o new-api

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

COPY --from=builder2 /build/new-api /
COPY LICENSE NOTICE THIRD-PARTY-LICENSES.md /licenses/
EXPOSE 3000
WORKDIR /data
ENTRYPOINT ["/new-api"]
