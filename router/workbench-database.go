package router

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"gorm.io/gorm"
)

// Separate connections can still address the same physical database. Check
// read-only engine metadata before running any workbench migration.
func validateWorkbenchDatabaseIsolation(primary, workbench *gorm.DB) error {
	if primary == nil || workbench == nil {
		return errors.New("both host and workbench databases are required")
	}
	left, err := primary.DB()
	if err != nil {
		return err
	}
	right, err := workbench.DB()
	if err != nil {
		return err
	}
	if left == right {
		return errors.New("workbench must use a separate database")
	}
	if primary.Dialector.Name() != workbench.Dialector.Name() {
		return nil
	}
	var identities [2]string
	var sqliteFiles [2]os.FileInfo
	for i, db := range []*gorm.DB{primary, workbench} {
		switch db.Dialector.Name() {
		case "sqlite":
			var rows []struct {
				Name string
				File string
			}
			if err := db.Raw("PRAGMA database_list").Scan(&rows).Error; err != nil {
				return err
			}
			for _, row := range rows {
				if row.Name != "main" {
					continue
				}
				// Independent in-memory connections do not share a file.
				if row.File == "" {
					continue
				}
				file, err := filepath.Abs(row.File)
				if err != nil {
					return err
				}
				file, err = filepath.EvalSymlinks(file)
				if err != nil {
					return err
				}
				if runtime.GOOS == "windows" {
					file = strings.ToLower(file)
				}
				identities[i] = file
				info, err := os.Stat(file)
				if err != nil {
					return err
				}
				sqliteFiles[i] = info
			}
		case "postgres":
			if err := db.Raw("SELECT concat_ws('|', current_database(), current_schema(), coalesce(inet_server_addr()::text, 'local'), coalesce(inet_server_port()::text, 'local'))").Scan(&identities[i]).Error; err != nil {
				return err
			}
		case "mysql":
			if err := db.Raw("SELECT CONCAT_WS('|', DATABASE(), @@hostname, @@port)").Scan(&identities[i]).Error; err != nil {
				return err
			}
		default:
			return errors.New("cannot verify workbench database isolation")
		}
	}
	if sqliteFiles[0] != nil && sqliteFiles[1] != nil && os.SameFile(sqliteFiles[0], sqliteFiles[1]) {
		return errors.New("workbench must use a separate physical database")
	}
	if identities[0] != "" && identities[0] == identities[1] {
		return errors.New("workbench must use a separate physical database or PostgreSQL schema")
	}
	return nil
}
