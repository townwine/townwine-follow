function pad(value: string) {
  return String(value || "").padStart(2, "0");
}

export function formatOpenAtLabel(openAtKst: string) {
  const trimmedValue = String(openAtKst || "").trim();

  if (!trimmedValue) {
    return "";
  }

  const directMatch = trimmedValue.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/,
  );

  if (directMatch) {
    const [, , month, day, hour, minute] = directMatch;
    return `${month}월 ${day}일 ${hour}:${minute}`;
  }

  const parsedTimestamp = Date.parse(trimmedValue);

  if (!Number.isFinite(parsedTimestamp)) {
    return trimmedValue;
  }

  const formatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const formattedParts = formatter.formatToParts(new Date(parsedTimestamp));
  const partByType = Object.fromEntries(
    formattedParts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  return `${pad(partByType.month)}월 ${pad(partByType.day)}일 ${pad(partByType.hour)}:${pad(partByType.minute)}`;
}
