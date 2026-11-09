export function Panel({ title, icon: Icon, action, children, className = '' }) {
  return (
    <section className={'panel ' + className}>
      {title && (
        <div className="panel-header">
          <h2>
            {Icon && <Icon size={19} />}
            {title}
          </h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
