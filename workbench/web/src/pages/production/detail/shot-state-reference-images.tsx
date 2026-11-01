import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "antd";
import { AssetLibraryPickerModal, type AssetLibraryPickerItem } from "@/components/assets/asset-library-picker-modal";
import { resourceFileUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import { listProjectAssetsPage, type ProjectDetail } from "@/services/api/projects";
import { uploadImage } from "@/services/image-storage";
import { loadRasterImage } from "@/lib/image-raster";

export function ShotStateReferenceImages({ detail, value = [], onChange }: { detail: ProjectDetail; value?: string[]; onChange?: (ids: string[]) => void }) {
    const [open, setOpen] = useState(false);
    const [page, setPage] = useState(1),
        [pageSize, setPageSize] = useState(40),
        [uploaded, setUploaded] = useState<AssetLibraryPickerItem[]>([]);
    const images = useQuery({ queryKey: ["project", detail.project.id, "assets", "shot-state-images", page, pageSize], queryFn: ({ signal }) => listProjectAssetsPage(detail.project.id, { page, pageSize, mediaType: "image" }, signal), enabled: open });
    const items: AssetLibraryPickerItem[] = [...uploaded];
    for (const asset of images.data?.assets || detail.assets) {
        const id = resourceIdFromStorageKey(asset.storageKey);
        if (id && asset.mediaType === "image" && asset.status !== "archived" && !items.some((item) => item.id === id)) items.push({ id, title: asset.title, category: "image", kindLabel: "图片", mediaKind: "image", imageUrl: resourceFileUrl(id) });
    }
    for (const [index, id] of value.entries()) if (!items.some((item) => item.id === id)) items.push({ id, title: `原固定参考 ${index + 1}`, category: "image", kindLabel: "图片", mediaKind: "image", imageUrl: resourceFileUrl(id) });
    async function uploadReferences(files: FileList) {
        if (files.length > 12) throw new Error("每次最多上传12张参考图");
        if (Array.from(files).some((file) => !file.type.startsWith("image/"))) throw new Error("请选择图片文件");
        const created: AssetLibraryPickerItem[] = [];
        try {
            for (const file of Array.from(files)) {
                const preview = URL.createObjectURL(file);
                try {
                    await loadRasterImage(preview);
                } catch {
                    throw new Error(`“${file.name}”无法读取，请重新导出为 PNG、JPEG、WebP 或 AVIF 图片`);
                } finally {
                    URL.revokeObjectURL(preview);
                }
                const result = await uploadImage(file),
                    id = resourceIdFromStorageKey(result.storageKey);
                if (!id) throw new Error("图片尚未保存到服务端，请核对后再选择");
                const item: AssetLibraryPickerItem = { id, title: file.name, category: "image", kindLabel: "图片", mediaKind: "image", imageUrl: resourceFileUrl(id) };
                created.push(item);
                setUploaded((previous) => [...previous.filter((value) => value.id !== id), item]);
            }
        } catch (error) {
            throw new Error(`${created.length ? `已有${created.length}张图片上传成功，可继续选择。` : ""}${error instanceof Error ? error.message : "这张图片无法读取，请检查文件格式后再上传"}`);
        }
        return created.map((item) => item.id);
    }
    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
                {value.map((id, index) => (
                    <div key={id} className="space-y-1">
                        <a href={resourceFileUrl(id)} target="_blank" rel="noreferrer">
                            <img src={resourceFileUrl(id)} alt={`固定参考图 ${index + 1}`} loading="lazy" className="h-16 w-20 rounded object-contain" />
                        </a>
                        <Button size="small" aria-label={`移除固定参考图 ${index + 1}`} onClick={() => onChange?.(value.filter((item) => item !== id))}>
                            移除
                        </Button>
                    </div>
                ))}
            </div>
            <Button
                size="small"
                onClick={() => {
                    setPage(1);
                    setOpen(true);
                }}
            >
                选择固定参考图（{value.length}/12）
            </Button>
            <p className="text-xs text-foreground/55">选择项目图片或上传参考图；保存脚本后会固定在此镜头版本，并传给支持参考图的模型。</p>
            {images.isError && (
                <div role="alert" className="space-y-1 text-sm">
                    <p>{images.error.message}</p>
                    <Button size="small" onClick={() => void images.refetch()}>
                        重新读取项目图片
                    </Button>
                </div>
            )}
            <AssetLibraryPickerModal
                open={open}
                items={items}
                mediaKinds={["image"]}
                categoryLabels={{ all: "全部图片", image: "图片" }}
                title="选择接戏参考图"
                initialSelectedIds={value}
                loading={images.isLoading}
                pagination={{
                    current: page,
                    pageSize,
                    total: images.data?.total || 0,
                    onChange: (next, size) => {
                        setPage(size === pageSize ? next : 1);
                        setPageSize(size);
                    },
                }}
                upload={{ accept: "image/png,image/jpeg,image/webp,image/avif", description: "最多选择12张，上传后请保存脚本", onUpload: uploadReferences }}
                onClose={() => setOpen(false)}
                onConfirm={(ids) => {
                    if (ids.length > 12) throw new Error("每项状态最多选择12张固定参考图");
                    onChange?.(ids);
                    setOpen(false);
                }}
            />
        </div>
    );
}
