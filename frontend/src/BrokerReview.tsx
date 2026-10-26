
import { useEffect, useState } from "react";

type Evidence = {
  id: number;
  filename: string | null;
  evidence_type: string;
};

type ReviewField = {
  id: number;
  field_key: string;
  value: string | null;
  source_type: string;
  source_id: number | null;
  confidence: number | null;
  review_status: string;
  reviewer_value: string | null;
  reviewer_notes: string | null;
  evidence: Evidence | null;
};

type ApprovedField = {
  field_id: number;
  field_key: string;
  approved_value: string | null;
  source_evidence_id: number | null;
};

const labels: Record<string, string> = {
  number_of_stories: "Number of stories",
  exterior_wall_type: "Exterior wall material",
  roof_type: "Roof material",
  foundation_type: "Foundation",
  flooring_type: "Flooring",
  countertop_material: "Countertops",
  hvac_type: "HVAC",
  water_heater_type: "Water heater",
  electrical_service: "Electrical service",
};

const control = {
  padding: "10px",
  border: "1px solid #aeb9c6",
  borderRadius: "6px",
  background: "#fff",
  color: "#222",
  fontSize: "15px",
};

function ReviewCard({
  inspectionId,
  field,
  refresh,
}: {
  inspectionId: number;
  field: ReviewField;
  refresh: () => Promise<void>;
}) {
  const [value, setValue] = useState(
    field.reviewer_value || field.value || ""
  );
  const [notes, setNotes] = useState(field.reviewer_notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setValue(field.reviewer_value || field.value || "");
    setNotes(field.reviewer_notes || "");
  }, [field]);

  async function save(
    decision: "approved" | "corrected" | "rejected"
  ) {
    setSaving(true);
    setError("");

    try {
      const response = await fetch(
        `/api/inspections/${inspectionId}/fields/${field.id}/review`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            reviewer_value: decision === "corrected" ? value : null,
            reviewer_notes: notes || null,
          }),
        }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          typeof body?.detail === "string"
            ? body.detail
            : "Review could not be saved"
        );
      }

      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article style={{
      padding: "18px",
      border: "1px solid #d5dce5",
      borderRadius: "8px",
      marginBottom: "14px",
      background: "#fff",
    }}>
      <h3>{labels[field.field_key] || field.field_key}</h3>

      <p><strong>AI value:</strong> {field.value || "Not available"}</p>
      <p><strong>Status:</strong> {field.review_status}</p>
      <p>
        <strong>Confidence:</strong>{" "}
        {field.confidence === null
          ? "Not available"
          : `${Math.round(field.confidence * 100)}%`}
      </p>
      <p>
        <strong>Evidence:</strong>{" "}
        {field.evidence?.filename ||
          (field.source_id
            ? `Evidence #${field.source_id}`
            : "No source")}
      </p>

      {field.source_type === "mock" ? (
        <p style={{ color: "#895800" }}>
          Mock placeholder — cannot be approved.
        </p>
      ) : (
        <>
          <label style={{ display: "block", marginBottom: "12px" }}>
            Corrected value
            <input
              style={{ ...control, display: "block", width: "95%" }}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>

          <label style={{ display: "block", marginBottom: "12px" }}>
            Broker notes
            <textarea
              style={{ ...control, display: "block", width: "95%" }}
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>

          {error && <p role="alert" style={{ color: "red" }}>{error}</p>}

          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <button
              style={control}
              disabled={saving}
              onClick={() => void save("approved")}
            >
              Approve
            </button>
            <button
              style={control}
              disabled={saving || !value.trim()}
              onClick={() => void save("corrected")}
            >
              Save Correction
            </button>
            <button
              style={control}
              disabled={saving}
              onClick={() => void save("rejected")}
            >
              Reject
            </button>
          </div>
        </>
      )}
    </article>
  );
}

export default function BrokerReview({
  inspectionId,
}: {
  inspectionId: number;
}) {
  const [fields, setFields] = useState<ReviewField[]>([]);
  const [approved, setApproved] = useState<ApprovedField[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    const [reviewResponse, approvedResponse] = await Promise.all([
      fetch(`/api/inspections/${inspectionId}/review`),
      fetch(`/api/inspections/${inspectionId}/approved-fields`),
    ]);

    if (!reviewResponse.ok || !approvedResponse.ok) {
      throw new Error("Could not load review data");
    }

    const review = await reviewResponse.json();
    const approvedData = await approvedResponse.json();

    setFields(review.fields);
    setApproved(approvedData.fields);
  }

  useEffect(() => {
    let active = true;

    async function initialize() {
      setLoading(true);
      try {
        const [reviewResponse, approvedResponse] = await Promise.all([
          fetch(`/api/inspections/${inspectionId}/review`),
          fetch(`/api/inspections/${inspectionId}/approved-fields`),
        ]);

        if (!reviewResponse.ok || !approvedResponse.ok) {
          throw new Error("Could not load review data");
        }

        const review = await reviewResponse.json();
        const approvedData = await approvedResponse.json();

        if (active) {
          setFields(review.fields);
          setApproved(approvedData.fields);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Load failed");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void initialize();
    return () => { active = false; };
  }, [inspectionId]);

  const reviewable = fields.filter(
    (field) => field.source_type !== "mock"
  );

  const pending = reviewable.filter(
    (field) => field.review_status === "pending"
  ).length;

  return (
    <section style={{
      background: "#f8fafc",
      color: "#222",
      border: "1px solid #d8dce3",
      padding: "24px",
      borderRadius: "10px",
      marginBottom: "24px",
    }}>
      <h2>Broker Review</h2>
      <p>Review AI findings before preparing insurance forms.</p>

      {loading && <p>Loading...</p>}
      {error && <p role="alert" style={{ color: "red" }}>{error}</p>}

      {!loading && (
        <>
          <p>
            <strong>{pending}</strong> pending findings ·{" "}
            <strong>{reviewable.length}</strong> total
          </p>

          {fields.length === 0 && (
            <p>No AI findings yet. Mock mode does not generate findings.</p>
          )}

          {fields.map((field) => (
            <ReviewCard
              key={field.id}
              inspectionId={inspectionId}
              field={field}
              refresh={refresh}
            />
          ))}

          <h3>Approved Application Candidates</h3>

          {approved.length === 0 ? (
            <p>No approved values yet.</p>
          ) : (
            <ul>
              {approved.map((item) => (
                <li key={item.field_id}>
                  <strong>{labels[item.field_key] || item.field_key}:</strong>{" "}
                  {item.approved_value}{" "}
                  (Evidence #{item.source_evidence_id ?? "N/A"})
                </li>
              ))}
            </ul>
          )}

          <p style={{ fontSize: "13px", color: "#596579" }}>
            Approved candidates still require reconciliation
            and mapping to the correct ACORD form.
          </p>
        </>
      )}
    </section>
  );
}
