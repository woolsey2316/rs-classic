import { useEffect, useState } from "react";

export function spriteUrl(item) {
  if (!item?.sprite) return null;
  return `/sprites/weapons/${item.sprite}.png`;
}

export function useItemSprites(items) {
  const sprites = [
    ...new Set((items || []).map((item) => item?.sprite).filter(Boolean)),
  ].sort();
  const key = sprites.join(",");
  const [images, setImages] = useState({});

  useEffect(() => {
    if (!key) {
      setImages({});
      return undefined;
    }
    let cancelled = false;
    Promise.all(
      sprites.map((sprite) => {
        const img = new Image();
        img.src = spriteUrl({ sprite });
        return img
          .decode()
          .then(() => [sprite, img])
          .catch(() => [sprite, null]);
      }),
    ).then((entries) => {
      if (!cancelled) {
        setImages(Object.fromEntries(entries));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return images;
}
