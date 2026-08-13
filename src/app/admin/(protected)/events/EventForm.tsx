type PerformerOption = { id: string; name: string; type: string };

export default function EventForm({
  action,
  performers,
  defaultValues,
  submitLabel,
}: {
  action: (formData: FormData) => void;
  performers: PerformerOption[];
  defaultValues?: {
    title: string;
    venue: string;
    description: string;
    date: string;
    startTime: string;
    endTime: string;
    performerIds: string[];
  };
  submitLabel: string;
}) {
  const v = defaultValues;

  return (
    <form
      action={action}
      className="surface d-flex flex-column gap-3 p-4"
      style={{ maxWidth: "32rem" }}
    >
      <div>
        <label className="form-label">Название *</label>
        <input
          name="title"
          required
          defaultValue={v?.title}
          className="form-control"
        />
      </div>

      <div>
        <label className="form-label">Место *</label>
        <input
          name="venue"
          required
          defaultValue={v?.venue}
          className="form-control"
        />
      </div>

      <div className="row g-3">
        <div className="col-12 col-sm-4">
          <label className="form-label">Дата *</label>
          <input
            type="date"
            name="date"
            required
            defaultValue={v?.date}
            className="form-control"
          />
        </div>
        <div className="col-6 col-sm-4">
          <label className="form-label">Начало *</label>
          <input
            type="time"
            name="startTime"
            required
            defaultValue={v?.startTime}
            className="form-control"
          />
        </div>
        <div className="col-6 col-sm-4">
          <label className="form-label">Конец</label>
          <input
            type="time"
            name="endTime"
            defaultValue={v?.endTime}
            className="form-control"
          />
        </div>
      </div>

      <div>
        <label className="form-label">Описание</label>
        <textarea
          name="description"
          rows={3}
          defaultValue={v?.description}
          className="form-control"
        />
      </div>

      <div>
        <label className="form-label d-block">Исполнители / группы</label>
        {performers.length === 0 ? (
          <p className="small text-secondary">
            Нет добавленных исполнителей. Добавьте их в разделе «Исполнители».
          </p>
        ) : (
          <div className="d-flex flex-wrap gap-3">
            {performers.map((p) => (
              <div className="form-check" key={p.id}>
                <input
                  type="checkbox"
                  name="performerIds"
                  value={p.id}
                  id={`performer-${p.id}`}
                  defaultChecked={v?.performerIds.includes(p.id)}
                  className="form-check-input"
                />
                <label
                  className="form-check-label"
                  htmlFor={`performer-${p.id}`}
                >
                  {p.name}
                </label>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-2">
        <button type="submit" className="btn btn-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
