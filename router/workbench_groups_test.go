package router

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestWorkbenchModelsIncludeSelectableGroupsAndExcludeForeignGroups(t *testing.T) {
	previousMaster, previousPath := common.IsMasterNode, common.SQLitePath
	previousType := common.MainDatabaseType()
	previousDB := model.DB
	common.IsMasterNode, common.SQLitePath = false, filepath.Join(t.TempDir(), "columns.db")
	t.Setenv("SQL_DSN", "local")
	require.NoError(t, model.InitDB())
	initialized, err := model.DB.DB()
	require.NoError(t, err)
	require.NoError(t, initialized.Close())
	model.DB = previousDB
	t.Cleanup(func() {
		common.IsMasterNode, common.SQLitePath = previousMaster, previousPath
		common.SetMainDatabaseType(previousType)
	})
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Channel{}, &model.Ability{}, &model.Model{}, &model.Vendor{}))
	previousRedis := common.RedisEnabled
	previousGroups, previousRatios := setting.UserUsableGroups2JSONString(), ratio_setting.GroupRatio2JSONString()
	model.DB, common.RedisEnabled = db, false
	t.Cleanup(func() {
		model.DB, common.RedisEnabled = previousDB, previousRedis
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(previousGroups))
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(previousRatios))
		model.InvalidatePricingCache()
		connection, _ := db.DB()
		_ = connection.Close()
	})
	t.Setenv("STUDIO_LOCAL_MODEL_URL", "")
	t.Setenv("STUDIO_LOCAL_CAPABILITY_MODELS", "")
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"Default","vip":"VIP","h3":"H3","sd2":"Seedance","empty":"Empty"}`))
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"vip":2,"h3":1,"sd2":1,"empty":1,"private":3}`))
	user := model.User{Id: 77001, Username: "host-group-regression", Password: "unused", Group: "default", Status: common.UserStatusEnabled}
	require.NoError(t, db.Create(&user).Error)
	require.NoError(t, db.Create(&model.Channel{Id: 771, Type: constant.ChannelTypeOpenAI, Name: "test", Status: common.ChannelStatusEnabled}).Error)
	require.NoError(t, db.Create(&model.Model{ModelName: "gpt-4o", Description: "管理员配置的文本模型描述", Status: 1}).Error)
	require.NoError(t, db.Create(&[]model.Ability{
		{Group: "default", Model: "gpt-4o", ChannelId: 771, Enabled: true},
		{Group: "vip", Model: "gpt-4o", ChannelId: 771, Enabled: true},
		{Group: "private", Model: "gpt-4o", ChannelId: 771, Enabled: true},
	}).Error)
	model.InvalidatePricingCache()
	models, err := (newAPIWorkbenchHost{}).Models(context.Background(), "77001")
	require.NoError(t, err)
	require.Len(t, models, 2)
	require.Equal(t, "default", models[0].Group)
	require.Equal(t, "vip", models[1].Group)
	require.NotEqual(t, models[0].Key, models[1].Key)
	require.NotEqual(t, models[0].PriceLabel, models[1].PriceLabel)
	require.Equal(t, workbenchModelKey("gpt-4o", "text"), models[0].Key)
	require.Equal(t, "管理员配置的文本模型描述", models[0].Description)
	require.Equal(t, models[0].Description, models[1].Description)
	groups, err := (newAPIWorkbenchHost{}).Groups(context.Background(), "77001")
	require.NoError(t, err)
	var groupIDs []string
	for _, group := range groups {
		groupIDs = append(groupIDs, group.ID)
	}
	require.ElementsMatch(t, []string{"default", "vip", "h3", "sd2", "empty"}, groupIDs)

	previousPrices := ratio_setting.ModelPrice2JSONString()
	t.Cleanup(func() { require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(previousPrices)) })
	require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(`{"sd4-seedance2.0fast-720p":0}`))
	require.NoError(t, db.Create(&model.Ability{Group: "sd2", Model: "sd4-seedance2.0fast-720p", ChannelId: 771, Enabled: true}).Error)
	require.NoError(t, db.Create(&model.Model{ModelName: "sd4-seedance2.0fast-720p", Description: "公开价格目录隐藏的模型描述", Status: 2}).Error)
	model.InvalidatePricingCache()
	for _, price := range model.GetPricing() {
		require.NotEqual(t, "sd4-seedance2.0fast-720p", price.ModelName, "fixture hides this model from the public price list")
	}
	models, err = (newAPIWorkbenchHost{}).Models(context.Background(), "77001")
	require.NoError(t, err)
	var legacyVideos int
	for _, item := range models {
		if item.Name == "sd4-seedance2.0fast-720p" {
			legacyVideos++
			require.Equal(t, "video", item.Capability)
			require.Equal(t, "newapi", item.Protocol)
			require.Equal(t, "sd2", item.Group)
			require.Equal(t, "公开价格目录隐藏的模型描述", item.Description)
			duration := item.CapabilityConfig["video"].(map[string]any)["duration"].(map[string]any)
			require.Equal(t, 5, duration["default"])
			require.Greater(t, duration["max"].(int), 15)
		}
	}
	require.Equal(t, 1, legacyVideos, "legacy video SKU must reach the selectable group catalog")
}
