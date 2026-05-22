import { Table2 } from "lucide-react";
import type { ProcessResponse } from "../types";

type ResultsTableProps = {
  result: ProcessResponse | null;
  linkColumns: string[];
};

export function ResultsTable({ result, linkColumns }: ResultsTableProps) {
  if (!result) {
    return (
      <div className="empty-state">
        <Table2 size={36} />
        <p>Generated rows will appear here before saving.</p>
      </div>
    );
  }

  return (
    <div className="results-area">
      <div className="table-wrap">
        <table
          style={{
            minWidth: linkColumns.length > 0 ? `${180 + linkColumns.length * 300}px` : "100%",
          }}
        >
          <thead>
            <tr>
              <th>SKU</th>
              {linkColumns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.sku}>
                <td>{row.sku}</td>
                {linkColumns.map((_, index) => (
                  <td key={`${row.sku}-${index}`}>
                    {row.links[index] ? (
                      <a href={row.links[index]} target="_blank" rel="noreferrer">
                        {row.links[index]}
                      </a>
                    ) : (
                      <span className="muted">Blank</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.failures.length > 0 && (
        <section className="failure-list">
          <h3>Review these items</h3>
          {result.failures.map((failure, index) => (
            <div key={`${failure.sku}-${failure.item}-${index}`}>
              <strong>{failure.sku}</strong>
              <span>{failure.item}</span>
              <p>{failure.message}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
