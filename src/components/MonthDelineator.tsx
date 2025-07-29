
interface MonthDelineatorProps {
  month: string;
  year: number;
  taskCount: number;
}

export const MonthDelineator = ({ month, year, taskCount }: MonthDelineatorProps) => {
  return (
    <div className="bg-background/90 backdrop-blur-sm border-b border-border px-4 py-3 mb-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {month} {year}
          </h3>
          <p className="text-xs text-muted-foreground">
            {taskCount} task{taskCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
    </div>
  );
};
