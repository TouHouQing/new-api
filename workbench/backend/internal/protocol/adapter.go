package protocol

import "context"

// Adapter owns only protocol translation. The host owns credentials, outbound
// security, polling leases, billing, result downloads and task recovery.
type Adapter interface {
	Metadata() Metadata
	BuildCreate(context.Context, RequestContext) (RequestSpec, error)
	ParseCreate(context.Context, []byte) (CreateResult, error)
	BuildPoll(context.Context, PollContext) (RequestSpec, error)
	ParsePoll(context.Context, PollContext, []byte) (PollResult, error)
	BuildCancel(context.Context, PollContext) (RequestSpec, error)
}

type RequestAwareCreateParser interface {
	ParseCreateWithRequest(context.Context, GenerationRequest, []byte) (CreateResult, error)
}

// CreateRecoveryAdapter may inspect an existing receipt after a lost create
// response. It must return a read-only request; the host never repeats create.
type CreateRecoveryAdapter interface {
	BuildCreateRecovery(context.Context, RequestContext) (RequestSpec, error)
}

// AgentAdapter is the optional protocol surface for tool-capable text calls.
// The host still owns credentials, outbound policy and billing; a plugin only
// maps the platform's agent request into the provider payload and parses the
// provider response back into the platform tool-call contract.
type AgentAdapter interface {
	BuildAgent(context.Context, AgentRequestContext) (RequestSpec, error)
	ParseAgent(context.Context, []byte) (AgentResult, error)
}

// AgentCapability lets the host distinguish a declarative provider that
// actually declares an agent operation from one that only satisfies the Go
// method set through the shared manifest adapter implementation.
type AgentCapability interface {
	AgentAvailable() bool
}

// AgentRecoveryAdapter reads the original submission receipt after an uncertain
// response. Recovery must never submit a second model step.
type AgentRecoveryAdapter interface {
	BuildAgentRecovery(context.Context, AgentRequestContext) (RequestSpec, error)
}

// ResultAdapter optionally resolves an authenticated binary result after an
// asynchronous task succeeds without returning a public media URL.
type ResultAdapter interface {
	BuildResult(context.Context, PollContext) (RequestSpec, error)
}

type ResultCapability interface {
	ResultAvailable() bool
}

// MediaUploadAdapter 是可选的素材前置上传面：上游要求先上传文件拿到素材 ID，
// create 再按 ID 引用。UploadKinds 为空表示该适配器未声明上传步骤。
type MediaUploadAdapter interface {
	UploadKinds() []string
	BuildUpload(context.Context, RequestContext, MediaReference) (RequestSpec, error)
	ParseUpload(context.Context, []byte) (string, error)
}

type AgentRequestContext struct {
	BaseURL string
	Model   string
	Request map[string]any
	// Host policy, deliberately outside the plugin-visible request templates.
	IdempotencyKey      string
	MaxOutputTokens     int
	ContextWindowTokens int
	Thinking            bool
}

type AgentToolCall struct {
	ID               string
	Name             string
	Arguments        string
	ThoughtSignature string
}

type AgentResult struct {
	Text      string
	Reasoning string
	ToolCalls []AgentToolCall
	Usage     map[string]any
}

type UnavailableAdapter struct {
	Info Metadata
}

func (a UnavailableAdapter) Metadata() Metadata { return a.Info }

func (a UnavailableAdapter) BuildCreate(context.Context, RequestContext) (RequestSpec, error) {
	return RequestSpec{}, unavailable(a.Info)
}

func (a UnavailableAdapter) ParseCreate(context.Context, []byte) (CreateResult, error) {
	return CreateResult{}, unavailable(a.Info)
}

func (a UnavailableAdapter) BuildPoll(context.Context, PollContext) (RequestSpec, error) {
	return RequestSpec{}, unavailable(a.Info)
}

func (a UnavailableAdapter) ParsePoll(context.Context, PollContext, []byte) (PollResult, error) {
	return PollResult{}, unavailable(a.Info)
}

func (a UnavailableAdapter) BuildCancel(context.Context, PollContext) (RequestSpec, error) {
	return RequestSpec{}, unavailable(a.Info)
}
