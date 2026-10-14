package studioagent

import (
	"archive/zip"
	"bytes"
	"embed"
	"io/fs"
	"strings"
	"sync"
)

//go:embed skills
var skillFiles embed.FS

//go:embed schema/project.json
var projectSchema []byte

func ProjectSchema() []byte { return projectSchema }

//go:embed schema/assistant-plan.json
var assistantPlanSchema []byte

func AssistantPlanSchema() []byte { return assistantPlanSchema }

var bundleOnce sync.Once
var bundleBytes []byte
var bundleError error

func SkillBundle() ([]byte, error) {
	bundleOnce.Do(func() {
		var buffer bytes.Buffer
		archive := zip.NewWriter(&buffer)
		bundleError = fs.WalkDir(skillFiles, "skills", func(path string, entry fs.DirEntry, err error) error {
			if err != nil || entry.IsDir() {
				return err
			}
			data, err := skillFiles.ReadFile(path)
			if err != nil {
				return err
			}
			file, err := archive.Create(strings.TrimPrefix(path, "skills/"))
			if err != nil {
				return err
			}
			_, err = file.Write(data)
			return err
		})
		if err := archive.Close(); bundleError == nil {
			bundleError = err
		}
		if bundleError == nil {
			bundleBytes = buffer.Bytes()
		}
	})
	return bundleBytes, bundleError
}
