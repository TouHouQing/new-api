import { Button } from "antd";
import { Video, ArrowUpRight, Coins, Gift, LogOut, RefreshCw, Settings, ShieldCheck } from "lucide-react";
import { Link } from "react-router";
import { useWalletBalance } from "@/hooks/use-wallet-balance";
import { useWorkspaceLogout } from "@/hooks/use-workspace-logout";
import { useUserStore } from "@/stores/use-user-store";
import { UserAvatar } from "./user-avatar";
import { UserGroupAvatarRing, UserGroupBadge } from "./user-group-badge";
import "./workspace-account-card.css";

/** 同一账户卡片用于顶部和侧栏；余额与退出均复用真实服务。 */
export function WorkspaceAccountCard({ onWallet, onNavigate }: { onWallet: () => void; onNavigate: () => void }) {
    const user = useUserStore((state) => state.user);
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    const referralAvailable = useUserStore((state) => state.referralAvailable);
    const { availableMicrocredits, refreshing, refresh } = useWalletBalance(user?.id, creditsEnabled);
    const { handleLogout, loggingOut } = useWorkspaceLogout();
    if (!user) return null;
    return (
        <section className="workspace-account-card" aria-label="我的账户">
            <header className="workspace-account-card-identity">
                <UserGroupAvatarRing>
                    <UserAvatar user={user} className="workspace-account-card-avatar" />
                </UserGroupAvatarRing>
                <div>
                    <strong className="workspace-account-card-name">
                        <span>{user.displayName || user.username}</span>
                        <UserGroupBadge />
                    </strong>
                    <span>@{user.username}</span>
                </div>
                <em>{user.role === "admin" ? "管理员" : "创作者"}</em>
            </header>
            {creditsEnabled ? (
                <div className="workspace-account-card-wallet">
                    <div className="workspace-account-card-balance">
                        <span>
                            <Coins />
                            可用积分
                        </span>
                        <strong>{availableMicrocredits === null ? "—" : (availableMicrocredits / 1_000_000).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}</strong>
                    </div>
                    {availableMicrocredits === null ? (
                        <Button size="small" loading={refreshing} icon={<RefreshCw />} onClick={() => void refresh()}>
                            刷新余额
                        </Button>
                    ) : (
                        <button type="button" onClick={onWallet}>
                            充值 / 兑换
                            <ArrowUpRight />
                        </button>
                    )}
                </div>
            ) : null}
            <nav className="workspace-account-card-actions" aria-label="账户操作">
                {import.meta.env.VITE_NEW_API_WORKBENCH === "true" ? (
                    <>
                        <a href="/dashboard">
                            <ArrowUpRight />
                            <span>返回 New API</span>
                        </a>
                        <a href="/settings">
                            <Settings />
                            <span>账户设置</span>
                        </a>
                        <a href="/studio/legacy">
                            <Video />
                            <span>原制作中心</span>
                        </a>
                    </>
                ) : (
                    <>
                        <Link to="/settings?section=profile" onClick={onNavigate}>
                            <Settings />
                            <span>账户与设置</span>
                            <ArrowUpRight />
                        </Link>
                        {referralAvailable ? (
                            <Link to="/referral" onClick={onNavigate}>
                                <Gift />
                                <span>推广中心</span>
                                <ArrowUpRight />
                            </Link>
                        ) : null}
                        {user.role === "admin" ? (
                            <Link to="/admin" onClick={onNavigate}>
                                <ShieldCheck />
                                <span>管理员后台</span>
                                <ArrowUpRight />
                            </Link>
                        ) : null}
                    </>
                )}
                <Button danger type="text" icon={<LogOut />} loading={loggingOut} onClick={() => void handleLogout()}>
                    {import.meta.env.VITE_NEW_API_WORKBENCH === "true" ? "管理登录会话" : "退出登录"}
                </Button>
            </nav>
            {import.meta.env.VITE_NEW_API_WORKBENCH === "true" ? (
                <footer className="mt-3 border-t border-border/65 pt-3 text-xs leading-relaxed text-foreground/60">
                    <a href="https://github.com/QuantumNous/new-api" target="_blank" rel="noopener noreferrer" className="underline">
                        New API · QuantumNous
                    </a>
                    <p>Frontend design and development by New API contributors.</p>
                    <a href="https://github.com/ddcat-ai/open-ai-canvas" target="_blank" rel="noopener noreferrer" className="underline">
                        影策 · 开源与致谢
                    </a>
                </footer>
            ) : null}
        </section>
    );
}
