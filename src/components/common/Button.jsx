export function Button({ icon: Icon, children, variant = '', className = '', ...props }) {
  return (
    <button type="button" className={'button ' + variant + ' ' + className} {...props}>
      {Icon && <Icon size={17} />}
      {children}
    </button>
  );
}
