import { useAuth } from "../context/AuthContext";
import { useRequirementMarks } from "../hooks/useRequirementMarks";
import { BriefCheckCard } from "./BriefCheckCard";

type CardProps = Parameters<typeof BriefCheckCard>[0];

/**
 * The project instructions check with its "We have this" marks. The marks are read only when this renders
 * (that is, when there is a check to show) and only for the two people who may act on them: the group leader
 * and the instructor. The server decides who may see or change a mark.
 */
export function BriefCheckWithMarks({ projectId, ...card }: Omit<CardProps, "marks"> & { projectId: number }) {
  const { token } = useAuth();
  const marks = useRequirementMarks(projectId, token, card.instructor ? "instructor" : "leader");
  return <BriefCheckCard {...card} marks={marks} />;
}
