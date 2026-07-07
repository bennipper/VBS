// Shows a custom uploaded photo when there is one, else falls back to the
// player's chosen emoji mug. Used everywhere a punter is shown.
export default function Avatar({ url, emoji, size = 24, className = '' }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className={`avatar-img ${className}`}
        style={{ width: size, height: size }}
        loading="lazy"
      />
    )
  }
  return (
    <span
      className={`avatar-emoji ${className}`}
      style={{ fontSize: Math.round(size * 0.82), lineHeight: 1 }}
    >
      {emoji ?? '🎲'}
    </span>
  )
}
