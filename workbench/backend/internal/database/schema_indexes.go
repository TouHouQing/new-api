package database

import (
	"strings"

	"gorm.io/gorm"
)

// All arguments are migration-owned SQL, never request data. MySQL has no
// partial indexes: NULL expressions preserve uniqueness only for matching rows.
func createSchemaIndex(db *gorm.DB, table, name string, unique bool, columns []string, predicate string) error {
	if db.Migrator().HasIndex(table, name) {
		return nil
	}
	class := ""
	if unique {
		class = "UNIQUE "
	}
	fields := append([]string(nil), columns...)
	where := ""
	if predicate != "" {
		if db.Dialector.Name() == "mysql" {
			if unique {
				for i, column := range fields {
					fields[i] = "(CASE WHEN " + predicate + " THEN " + column + " ELSE NULL END)"
				}
			}
		} else {
			where = " WHERE " + predicate
		}
	}
	stmt := &gorm.Statement{DB: db}
	return db.Exec("CREATE " + class + "INDEX " + stmt.Quote(name) + " ON " + stmt.Quote(table) + " (" + strings.Join(fields, ",") + ")" + where).Error
}

func dropSchemaIndex(db *gorm.DB, table, name string) error {
	if db.Dialector.Name() != "mysql" {
		stmt := &gorm.Statement{DB: db}
		return db.Exec("DROP INDEX IF EXISTS " + stmt.Quote(name)).Error
	}
	if !db.Migrator().HasIndex(table, name) {
		return nil
	}
	return db.Migrator().DropIndex(table, name)
}
