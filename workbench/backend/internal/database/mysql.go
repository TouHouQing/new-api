package database

import (
	"errors"
	"fmt"
	sqlmysql "github.com/go-sql-driver/mysql"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/schema"
	"strings"
	"time"
	"yingce/backend/internal/logging"
)

// The database stores the same UTF-8 identifiers and UTC microseconds as the
// native PostgreSQL contract. Driver-side truncation also covers bound CAS
// parameters, including timestamps explicitly supplied by domain services.
func openMySQL(config Config) (*gorm.DB, error) {
	dsn := strings.TrimSpace(config.DSN)
	if dsn == "" {
		return nil, errors.New("MySQL 模式必须配置 DATABASE_URL")
	}
	parsed, err := sqlmysql.ParseDSN(dsn)
	if err != nil {
		return nil, errors.New("MySQL DATABASE_URL 须为有效的原生 DSN")
	}
	if parsed.DBName == "" {
		return nil, errors.New("MySQL 连接必须明确指定数据库")
	}
	parsed.ParseTime = true
	parsed.ClientFoundRows = false
	parsed.Loc = time.UTC
	// The wire protocol encodes the initial collation in one byte. Use the
	// supported binary UTF-8 handshake; table comparisons use utf8mb4_0900_bin.
	parsed.Collation = "utf8mb4_bin"
	if parsed.Params == nil {
		parsed.Params = map[string]string{}
	}
	parsed.Params["time_zone"] = "'+00:00'"
	parsed.Params["transaction_isolation"] = "'READ-COMMITTED'"
	// Native nullable time.Time fields use Go zero to mean "not recorded".
	// Keep strict truncation and grouping checks while accepting that sentinel.
	parsed.Params["sql_mode"] = "TRIM(BOTH ',' FROM REPLACE(REPLACE(CONCAT(',',@@SESSION.sql_mode,','),',NO_ZERO_DATE,',','),',NO_ZERO_IN_DATE,',','))"
	if err := parsed.Apply(sqlmysql.TimeTruncate(time.Microsecond)); err != nil {
		return nil, err
	}
	precision := 6
	base := mysql.New(mysql.Config{DSNConfig: parsed, DefaultDatetimePrecision: &precision}).(*mysql.Dialector)
	db, err := gorm.Open(nativeMySQLDialector{base}, &gorm.Config{Logger: logging.GormLogger()})
	if err != nil {
		return nil, err
	}
	return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin").Session(&gorm.Session{}), nil
}

type nativeMySQLDialector struct{ *mysql.Dialector }

func (d nativeMySQLDialector) DataTypeOf(field *schema.Field) string {
	switch strings.ToLower(string(field.DataType)) {
	case "text", "mediumtext", "tinytext", "longtext":
		return "longtext"
	}
	return d.Dialector.DataTypeOf(field)
}
func (d nativeMySQLDialector) Migrator(db *gorm.DB) gorm.Migrator {
	base := d.Dialector.Migrator(db).(mysql.Migrator)
	base.Migrator.Config.Dialector = d
	base.Migrator.Config.CreateIndexAfterCreateTable = true
	return nativeMySQLMigrator{base}
}

type nativeMySQLMigrator struct{ mysql.Migrator }

func (m nativeMySQLMigrator) AlterColumn(value any, name string) error {
	return m.RunWithValue(value, func(stmt *gorm.Statement) error {
		if stmt.Schema != nil {
			if field := stmt.Schema.LookUpField(name); field != nil {
				return m.DB.Exec("ALTER TABLE ? MODIFY COLUMN ? ?", m.CurrentTable(stmt), clause.Column{Name: field.DBName}, m.FullDataTypeOf(field)).Error
			}
		}
		return fmt.Errorf("MySQL 迁移字段未定义：%s", name)
	})
}

func (m nativeMySQLMigrator) FullDataTypeOf(field *schema.Field) clause.Expr {
	copied := *field
	kind := strings.ToLower(string(field.DataType))
	if (strings.Contains(kind, "text") || kind == "json") && field.HasDefaultValue {
		if field.DefaultValueInterface != nil {
			copied.DefaultValue = "(" + m.Dialector.Explain("?", field.DefaultValueInterface) + ")"
			copied.DefaultValueInterface = nil
		} else if strings.HasPrefix(field.DefaultValue, "'") {
			copied.DefaultValue = "(" + field.DefaultValue + ")"
		}
	}
	return m.Migrator.FullDataTypeOf(&copied)
}
func (m nativeMySQLMigrator) CreateIndex(value any, name string) error {
	return m.RunWithValue(value, func(stmt *gorm.Statement) error {
		index := stmt.Schema.LookIndex(name)
		if index == nil {
			return fmt.Errorf("数据库索引 %s 未定义", name)
		}
		keyBytes := 0
		for _, field := range index.Fields {
			if field.GORMDataType == schema.String {
				keyBytes += max(field.Size, 191) * 4
			} else {
				keyBytes += 8
			}
		}
		wide := keyBytes > 3072
		if !wide && (index.Class != "UNIQUE" || strings.TrimSpace(index.Where) == "") {
			return m.Migrator.CreateIndex(value, name)
		}
		column := ""
		switch strings.ToLower(strings.TrimSpace(index.Where)) {
		case "":
		case "deleted_at is null":
			column = "deleted_at"
		case "archived_at is null":
			column = "archived_at"
		default:
			return fmt.Errorf("MySQL 尚未定义有效记录索引条件：%s", name)
		}
		expressions := []string{}
		for _, field := range index.Fields {
			if field.Expression != "" || field.DBName == "" {
				return fmt.Errorf("MySQL 有效记录索引表达式无效：%s", name)
			}
			expression := stmt.Quote(field.DBName)
			if wide && field.GORMDataType == schema.String {
				// Index the complete binary value, including long path suffixes.
				// Prefix indexes would reject distinct files with a shared prefix.
				expression = "UNHEX(SHA2(" + expression + ",256))"
			}
			if column != "" && index.Class == "UNIQUE" {
				expression = "CASE WHEN " + stmt.Quote(column) + " IS NULL THEN " + expression + " ELSE NULL END"
			}
			expressions = append(expressions, "("+expression+")")
		}
		class := ""
		if index.Class == "UNIQUE" {
			class = "UNIQUE "
		}
		return m.DB.Exec("CREATE " + class + "INDEX " + stmt.Quote(name) + " ON " + stmt.Quote(stmt.Table) + " (" + strings.Join(expressions, ",") + ")").Error
	})
}
