package service

import (
	"bytes"
	"encoding/json"
	"errors"
	"sort"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/google/uuid"
)

var ErrStudioBridgeUnavailable = errors.New("Studio workspace is unavailable")
var ErrStudioBridgeConflict = errors.New("Studio canvas changed; read its latest revision before editing")
var ErrStudioBridgePermission = errors.New("Studio workspace does not allow this operation")

type StudioBridgePermissions struct {
	AllowEdits      bool `json:"allowEdits"`
	AllowGeneration bool `json:"allowGeneration"`
}

type StudioBridgeOpen struct {
	ProjectID   string                  `json:"projectId"`
	Title       string                  `json:"title"`
	Revision    int64                   `json:"revision"`
	Snapshot    json.RawMessage         `json:"snapshot"`
	Permissions StudioBridgePermissions `json:"permissions"`
}

type StudioBridgeUpdate struct {
	Title    string          `json:"title"`
	Revision int64           `json:"revision"`
	Snapshot json.RawMessage `json:"snapshot,omitempty"`
}

type StudioBridgeCommandRequest struct {
	RequestID         string          `json:"requestId"`
	ExpectedRevision  int64           `json:"expectedRevision"`
	Kind              string          `json:"kind"`
	Operations        json.RawMessage `json:"operations,omitempty"`
	NodeID            string          `json:"nodeId,omitempty"`
	ConfirmGeneration bool            `json:"confirmGeneration,omitempty"`
	Budget            int64           `json:"budget,omitempty"`
}

type StudioBridgeCommand struct {
	StudioBridgeCommandRequest
	ID        string          `json:"id"`
	Status    string          `json:"status"`
	CreatedAt time.Time       `json:"createdAt"`
	Result    json.RawMessage `json:"result,omitempty"`
	Error     string          `json:"error,omitempty"`
}

type StudioBridgeWorkspace struct {
	ClientSeen  *time.Time              `json:"clientSeen,omitempty"`
	ID          string                  `json:"id"`
	ProjectID   string                  `json:"projectId"`
	Title       string                  `json:"title"`
	Revision    int64                   `json:"revision"`
	Permissions StudioBridgePermissions `json:"permissions"`
	LastSeen    time.Time               `json:"lastSeen"`
	Online      bool                    `json:"online"`
	Snapshot    json.RawMessage         `json:"snapshot,omitempty"`
	Commands    []StudioBridgeCommand   `json:"commands,omitempty"`
}

type studioBridgeSession struct {
	ownerID        int
	browserSession string
	workspace      StudioBridgeWorkspace
	jobs           map[string]StudioBridgeCommand
	order          []string
	storedBytes    int
}

// The browser remains the durable project owner. The bridge holds only bounded,
// short-lived control sessions. Multi-instance deployments need sticky routing
// for /api/studio/bridge; a restart requires reconnecting the open canvas.
type StudioBridge struct {
	mu       sync.Mutex
	sessions map[string]*studioBridgeSession
	now      func() time.Time
}

func NewStudioBridge() *StudioBridge {
	return &StudioBridge{sessions: make(map[string]*studioBridgeSession), now: time.Now}
}

var DefaultStudioBridge = NewStudioBridge()

func validateStudioBridgeSnapshot(raw json.RawMessage, projectID string) error {
	var snapshot struct {
		ContractVersion int `json:"contractVersion"`
		Project         struct {
			ID     string            `json:"id"`
			Nodes  []json.RawMessage `json:"nodes"`
			Edges  []json.RawMessage `json:"edges"`
			Assets []json.RawMessage `json:"assets"`
			Shots  []json.RawMessage `json:"shots"`
		} `json:"project"`
	}
	if err := common.Unmarshal(raw, &snapshot); err != nil || snapshot.ContractVersion != 1 || snapshot.Project.ID != projectID || len(snapshot.Project.Nodes) > 500 || len(snapshot.Project.Edges) > 1000 || len(snapshot.Project.Assets) > 200 || len(snapshot.Project.Shots) > 166 {
		return errors.New("Studio canvas snapshot is invalid")
	}
	return nil
}

func (bridge *StudioBridge) prune() {
	for id, session := range bridge.sessions {
		age := bridge.now().Sub(session.workspace.LastSeen)
		if age > 30*time.Minute {
			delete(bridge.sessions, id)
			continue
		}
		if age > time.Minute {
			for jobID, job := range session.jobs {
				if job.Status == "running" {
					job.Status = "uncertain"
					job.Error = "Studio workspace disconnected; inspect the canvas and existing tasks before retrying"
					session.jobs[jobID] = job
				}
			}
		}
	}
}

func (bridge *StudioBridge) find(ownerID int, id string) (*studioBridgeSession, error) {
	session := bridge.sessions[id]
	if session == nil || session.ownerID != ownerID {
		return nil, ErrStudioBridgeUnavailable
	}
	return session, nil
}

func (bridge *StudioBridge) Open(ownerID int, browserSession string, input StudioBridgeOpen) (StudioBridgeWorkspace, error) {
	if ownerID <= 0 || browserSession == "" || input.ProjectID == "" || utf8.RuneCountInString(input.ProjectID) > 128 || utf8.RuneCountInString(input.Title) > 200 || input.Revision <= 0 || len(input.Snapshot) == 0 || len(input.Snapshot) > 2<<20 {
		return StudioBridgeWorkspace{}, errors.New("Studio workspace input is invalid")
	}
	if err := validateStudioBridgeSnapshot(input.Snapshot, input.ProjectID); err != nil {
		return StudioBridgeWorkspace{}, err
	}
	bridge.mu.Lock()
	defer bridge.mu.Unlock()
	bridge.prune()
	owned := 0
	totalOwned := 0
	for _, session := range bridge.sessions {
		if session.ownerID == ownerID {
			totalOwned++
		}
		if session.ownerID == ownerID && bridge.now().Sub(session.workspace.LastSeen) <= time.Minute {
			owned++
		}
	}
	if owned >= 3 || totalOwned >= 6 || len(bridge.sessions) >= 64 {
		return StudioBridgeWorkspace{}, errors.New("Studio workspace connection limit reached")
	}
	workspace := StudioBridgeWorkspace{ID: uuid.NewString(), ProjectID: input.ProjectID, Title: input.Title, Revision: input.Revision, Permissions: input.Permissions, Snapshot: append(json.RawMessage(nil), input.Snapshot...), LastSeen: bridge.now(), Online: true}
	bridge.sessions[workspace.ID] = &studioBridgeSession{ownerID: ownerID, browserSession: browserSession, workspace: workspace, jobs: make(map[string]StudioBridgeCommand)}
	return workspace, nil
}

func (bridge *StudioBridge) List(ownerID int) []StudioBridgeWorkspace {
	bridge.mu.Lock()
	defer bridge.mu.Unlock()
	bridge.prune()
	workspaces := make([]StudioBridgeWorkspace, 0)
	for _, session := range bridge.sessions {
		if session.ownerID != ownerID {
			continue
		}
		workspace := session.workspace
		workspace.Snapshot = nil
		workspace.Online = bridge.now().Sub(workspace.LastSeen) <= time.Minute
		workspaces = append(workspaces, workspace)
	}
	sort.Slice(workspaces, func(i, j int) bool { return workspaces[i].LastSeen.After(workspaces[j].LastSeen) })
	return workspaces
}

func (bridge *StudioBridge) Read(ownerID int, id string) (StudioBridgeWorkspace, error) {
	bridge.mu.Lock()
	defer bridge.mu.Unlock()
	bridge.prune()
	session, err := bridge.find(ownerID, id)
	if err != nil {
		return StudioBridgeWorkspace{}, err
	}
	workspace := session.workspace
	workspace.Snapshot = append(json.RawMessage(nil), workspace.Snapshot...)
	workspace.Online = bridge.now().Sub(workspace.LastSeen) <= time.Minute
	return workspace, nil
}

// VerifyClient records an authenticated external read without extending the
// browser heartbeat or granting edit/generation permission.
func (bridge *StudioBridge) VerifyClient(ownerID int, id string) (StudioBridgeWorkspace, error) {
	bridge.mu.Lock()
	defer bridge.mu.Unlock()
	bridge.prune()
	session, err := bridge.find(ownerID, id)
	if err != nil {
		return StudioBridgeWorkspace{}, err
	}
	now := bridge.now()
	session.workspace.ClientSeen = &now
	workspace := session.workspace
	workspace.Snapshot = append(json.RawMessage(nil), workspace.Snapshot...)
	workspace.Online = now.Sub(workspace.LastSeen) <= time.Minute
	return workspace, nil
}

func (bridge *StudioBridge) Publish(ownerID int, browserSession, id string, input StudioBridgeUpdate) (StudioBridgeWorkspace, error) {
	bridge.mu.Lock()
	defer bridge.mu.Unlock()
	bridge.prune()
	session, err := bridge.find(ownerID, id)
	if err != nil || session.browserSession != browserSession {
		return StudioBridgeWorkspace{}, ErrStudioBridgeUnavailable
	}
	if input.Revision < session.workspace.Revision || input.Revision <= 0 || utf8.RuneCountInString(input.Title) > 200 || len(input.Snapshot) > 2<<20 {
		return StudioBridgeWorkspace{}, ErrStudioBridgeConflict
	}
	if len(input.Snapshot) > 0 {
		if err := validateStudioBridgeSnapshot(input.Snapshot, session.workspace.ProjectID); err != nil {
			return StudioBridgeWorkspace{}, err
		}
		if input.Revision == session.workspace.Revision && !bytes.Equal(input.Snapshot, session.workspace.Snapshot) {
			return StudioBridgeWorkspace{}, ErrStudioBridgeConflict
		}
		session.workspace.Snapshot = append(json.RawMessage(nil), input.Snapshot...)
	} else if input.Revision != session.workspace.Revision {
		return StudioBridgeWorkspace{}, ErrStudioBridgeConflict
	}
	session.workspace.Revision = input.Revision
	session.workspace.Title = input.Title
	session.workspace.LastSeen = bridge.now()
	workspace := session.workspace
	workspace.Snapshot = nil
	workspace.Online = true
	for _, jobID := range session.order {
		if job := session.jobs[jobID]; job.Status == "queued" {
			workspace.Commands = append(workspace.Commands, job)
		}
	}
	return workspace, nil
}

func (bridge *StudioBridge) Enqueue(ownerID int, id string, input StudioBridgeCommandRequest) (StudioBridgeCommand, error) {
	requestID, err := uuid.Parse(input.RequestID)
	if err != nil || input.ExpectedRevision <= 0 || len(input.Operations) > 256<<10 || utf8.RuneCountInString(input.NodeID) > 128 {
		return StudioBridgeCommand{}, errors.New("Studio command input is invalid")
	}
	input.RequestID = requestID.String()
	if input.Kind == "edit" {
		var operations []map[string]any
		if err := common.Unmarshal(input.Operations, &operations); err != nil || len(operations) == 0 || len(operations) > 100 {
			return StudioBridgeCommand{}, errors.New("Studio operations are invalid")
		}
		for _, operation := range operations {
			switch operation["op"] {
			case "set_previs", "set_motion_graphics", "group_nodes", "ungroup_nodes", "move_frame", "update_frame", "add_node", "update_node", "remove_nodes", "connect", "disconnect", "move_nodes", "duplicate", "layout", "arrange", "upsert_asset", "bind_assets", "add_shot", "apply_template", "set_audio_track", "select_take", "pin_connection", "pin_asset_version", "move_shot", "update_shot", "reorder_clips":
			default:
				return StudioBridgeCommand{}, errors.New("Studio operation is unsupported")
			}
		}
	} else if input.Kind != "run" || input.NodeID == "" || !input.ConfirmGeneration {
		return StudioBridgeCommand{}, errors.New("Studio generation requires a node and explicit confirmation")
	}
	if input.Budget < 0 || input.Budget > 2_000_000_000 {
		return StudioBridgeCommand{}, errors.New("invalid Studio quota budget")
	}
	bridge.mu.Lock()
	defer bridge.mu.Unlock()
	bridge.prune()
	session, err := bridge.find(ownerID, id)
	if err != nil {
		return StudioBridgeCommand{}, err
	}
	if previous, exists := session.jobs[input.RequestID]; exists {
		old, _ := common.Marshal(previous.StudioBridgeCommandRequest)
		current, _ := common.Marshal(input)
		if !bytes.Equal(old, current) {
			return StudioBridgeCommand{}, errors.New("Studio request ID was already used for another command")
		}
		return previous, nil
	}
	if bridge.now().Sub(session.workspace.LastSeen) > time.Minute {
		return StudioBridgeCommand{}, ErrStudioBridgeUnavailable
	}
	if input.ExpectedRevision != session.workspace.Revision {
		return StudioBridgeCommand{}, ErrStudioBridgeConflict
	}
	if (input.Kind == "edit" && !session.workspace.Permissions.AllowEdits) || (input.Kind == "run" && !session.workspace.Permissions.AllowGeneration) {
		return StudioBridgeCommand{}, ErrStudioBridgePermission
	}
	if len(session.jobs) >= 100 || session.storedBytes+len(input.Operations) > 4<<20 {
		// Receipts remain for the lifetime of the session: evicting one would
		// turn a late retry of its request ID into a second generation.
		return StudioBridgeCommand{}, errors.New("Studio command history is full; reconnect the canvas")
	}
	command := StudioBridgeCommand{StudioBridgeCommandRequest: input, ID: input.RequestID, Status: "queued", CreatedAt: bridge.now()}
	command.Operations = append(json.RawMessage(nil), input.Operations...)
	session.jobs[command.ID] = command
	session.storedBytes += len(command.Operations)
	session.order = append(session.order, command.ID)
	return command, nil
}

func (bridge *StudioBridge) Claim(ownerID int, browserSession, id, jobID string, revision int64) (bool, error) {
	bridge.mu.Lock()
	defer bridge.mu.Unlock()
	bridge.prune()
	session, err := bridge.find(ownerID, id)
	if err != nil || session.browserSession != browserSession {
		return false, ErrStudioBridgeUnavailable
	}
	if bridge.now().Sub(session.workspace.LastSeen) > time.Minute {
		return false, ErrStudioBridgeUnavailable
	}
	job, ok := session.jobs[jobID]
	if !ok {
		return false, ErrStudioBridgeUnavailable
	}
	if job.Status != "queued" {
		return false, nil
	}
	if job.ExpectedRevision != revision || session.workspace.Revision != revision {
		job.Status, job.Error = "failed", ErrStudioBridgeConflict.Error()
		session.jobs[jobID] = job
		return false, ErrStudioBridgeConflict
	}
	job.Status = "running"
	session.jobs[jobID] = job
	return true, nil
}

func (bridge *StudioBridge) Finish(ownerID int, browserSession, id, jobID string, result json.RawMessage, message string) error {
	if len(result) > 256<<10 || utf8.RuneCountInString(message) > 2000 {
		return errors.New("Studio command result is too large")
	}
	bridge.mu.Lock()
	defer bridge.mu.Unlock()
	session, err := bridge.find(ownerID, id)
	if err != nil || session.browserSession != browserSession {
		return ErrStudioBridgeUnavailable
	}
	job, exists := session.jobs[jobID]
	if !exists {
		return ErrStudioBridgeUnavailable
	}
	if job.Status != "running" && job.Status != "uncertain" {
		return nil
	}
	if session.storedBytes+len(result)-len(job.Result) > 4<<20 {
		return errors.New("Studio command history is full")
	}
	job.Status = "succeeded"
	if message != "" {
		job.Status = "failed"
	}
	job.Result = append(json.RawMessage(nil), result...)
	session.storedBytes += len(result)
	job.Error = message
	session.jobs[jobID] = job
	return nil
}

func (bridge *StudioBridge) Job(ownerID int, id, jobID string) (StudioBridgeCommand, error) {
	bridge.mu.Lock()
	defer bridge.mu.Unlock()
	bridge.prune()
	session, err := bridge.find(ownerID, id)
	if err != nil {
		return StudioBridgeCommand{}, err
	}
	job, ok := session.jobs[jobID]
	if !ok {
		return StudioBridgeCommand{}, ErrStudioBridgeUnavailable
	}
	return job, nil
}

func (bridge *StudioBridge) Close(ownerID int, browserSession, id string) error {
	bridge.mu.Lock()
	defer bridge.mu.Unlock()
	session, err := bridge.find(ownerID, id)
	if err != nil || session.browserSession != browserSession {
		return ErrStudioBridgeUnavailable
	}
	session.workspace.LastSeen = bridge.now().Add(-2 * time.Minute)
	activeJobs := false
	for jobID, job := range session.jobs {
		if job.Status == "queued" {
			job.Status, job.Error = "failed", "Studio workspace was disconnected before execution"
			session.jobs[jobID] = job
		}
		if job.Status == "running" || job.Status == "uncertain" {
			activeJobs = true
		}
	}
	if !activeJobs {
		delete(bridge.sessions, id)
		return nil
	}
	bridge.prune()
	return nil
}
