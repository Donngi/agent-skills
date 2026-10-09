import type { Project } from "../entity/Project";
import type { ProjectId } from "../value-object/ProjectId";

// -------------------------------------------------
// 型定義
// -------------------------------------------------

/**
 * ProjectRepository
 * プロジェクトの永続層への入出力インターフェース。
 */
export type ProjectRepository = Readonly<{
	/**
	 * 識別子で1件取る。無ければ undefined。
	 * @throws InvalidReconstructParamError 保存されている値が壊れているとき。
	 */
	get: (id: ProjectId) => Promise<Project | undefined>;
}>;
