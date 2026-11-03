/** @jsxImportSource preact */
import "@shopify/ui-extensions/preact";
import {render} from "preact";
import {useEffect, useState} from "preact/hooks";

export default function extension() { render(<CollectorTagBlock />, document.body); }

function buildResolutionSummary(state) {
  if (!state) {
    return "컬렉터 연결 정보를 아직 불러오지 못했어요.";
  }

  if (state.hostName || state.hostHandle || state.influencerHandle) {
    const displayName = state.hostName || state.influencerHandle;
    const publicHandle = state.hostHandle ? ` (${state.hostHandle})` : "";

    return `현재 연결 컬렉터: ${displayName}${publicHandle}`;
  }

  if (state.collectorTag) {
    return "입력된 태그가 있지만 아직 일치하는 컬렉터를 찾지 못했어요.";
  }

  return "아직 연결된 컬렉터가 없습니다.";
}

function buildSaveMessage(result) {
  if (!result?.ok) {
    return "저장 중 문제가 발생했습니다.";
  }

  if (result.state?.influencerHandle) {
    if (result.notification?.skipped === "PRODUCT_NOT_ACTIVE") {
      return "컬렉터 연결은 저장됐습니다. 상품이 활성 상태가 되면 메일 알림이 연결됩니다.";
    }

    return "컬렉터 연결이 저장됐습니다. 알림 대상이 있으면 팔로워 메일도 바로 발송됩니다.";
  }

  if (result.state?.collectorTag) {
    return "태그는 저장됐지만 일치하는 컬렉터를 찾지 못했습니다. 공개 핸들로 입력해보세요.";
  }

  return "컬렉터 연결이 비워졌습니다.";
}

function buildEnsureMessage(result) {
  if (!result?.ok) {
    return "";
  }

  const sentCount = Number(result.notification?.sentCount || 0);
  const failedCount = Number(result.notification?.failedCount || 0);

  if (sentCount > 0) {
    return `누락된 팔로워 메일 ${sentCount}건을 방금 발송했습니다.`;
  }

  if (failedCount > 0) {
    return `팔로워 메일 발송 중 ${failedCount}건 오류가 있었습니다.`;
  }

  return "";
}

function CollectorTagBlock() {
  const productId = shopify.data.selected?.[0]?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const [savedCollectorTag, setSavedCollectorTag] = useState("");
  const [draftCollectorTag, setDraftCollectorTag] = useState("");
  const [state, setState] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const dirty = draftCollectorTag !== savedCollectorTag;

  useEffect(() => {
    let active = true;

    async function loadState(options = {}) {
      const { background = false } = options;

      if (!productId) {
        setLoading(false);
        setState(null);
        return;
      }

      if (!background) {
        setLoading(true);
        setErrorMessage("");
        setStatusMessage("");
      }

      try {
        const response = await fetch(
          `/api/collector-tag?productId=${encodeURIComponent(
            productId,
          )}&ensureNotification=1`,
        );
        const result = await response.json();

        if (!response.ok || !result?.ok) {
          throw new Error(result?.message || "COLLECTOR_TAG_LOAD_FAILED");
        }

        if (!active) return;

        setState(result.state);
        setSavedCollectorTag(result.state.collectorTag || "");

        if (!background) {
          setDraftCollectorTag(result.state.collectorTag || "");
          setInputKey((value) => value + 1);
        }

        const ensureMessage = buildEnsureMessage(result);

        if (ensureMessage) {
          setStatusMessage(ensureMessage);
        }
      } catch (error) {
        if (!active) return;

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "컬렉터 태그를 불러오는 중 오류가 발생했습니다.",
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadState();

    return () => {
      active = false;
    };
  }, [productId]);

  async function handleSave() {
    if (!productId || saving) {
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      const response = await fetch("/api/collector-tag", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId,
          collectorTag: draftCollectorTag,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result?.ok) {
        throw new Error(result?.message || "COLLECTOR_TAG_SAVE_FAILED");
      }

      setState(result.state);
      setSavedCollectorTag(result.state?.collectorTag || "");
      setDraftCollectorTag(result.state?.collectorTag || "");
      setInputKey((value) => value + 1);
      setStatusMessage(buildSaveMessage(result));
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "컬렉터 태그를 저장하는 중 오류가 발생했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setDraftCollectorTag(savedCollectorTag);
    setInputKey((value) => value + 1);
    setErrorMessage("");
    setStatusMessage("");
  }

  return (
    <s-admin-block heading="컬렉터 태그">
      <s-stack direction="block" gap="base">
        <s-text>
          상품 저장 화면 상단에서 컬렉터를 바로 연결하는 입력칸입니다.
          닉네임보다는 공개 핸들을 넣는 것이 가장 정확합니다.
        </s-text>

        {loading ? (
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-spinner accessibilityLabel="불러오는 중" />
            <s-text>컬렉터 연결 정보를 불러오는 중입니다.</s-text>
          </s-stack>
        ) : (
          <s-stack direction="block" gap="base">
            <s-text-field
              key={inputKey}
              label="컬렉터 닉네임 또는 공개 핸들"
              placeholder="예: naeun 또는 @naeun"
              value={draftCollectorTag}
              onInput={(event) => setDraftCollectorTag(event.currentTarget.value)}
            />

            <s-text>{buildResolutionSummary(state)}</s-text>

            {state?.productStatus ? (
              <s-text>현재 상품 상태: {state.productStatus}</s-text>
            ) : null}

            {statusMessage ? <s-text>{statusMessage}</s-text> : null}
            {errorMessage ? <s-text>{errorMessage}</s-text> : null}

            <s-stack direction="inline" gap="base">
              <s-button
                variant="primary"
                disabled={!productId || saving || !dirty}
                onClick={handleSave}
              >
                {saving ? "저장 중..." : "컬렉터 저장"}
              </s-button>
              <s-button
                variant="secondary"
                disabled={saving || !dirty}
                onClick={handleReset}
              >
                되돌리기
              </s-button>
            </s-stack>
          </s-stack>
        )}
      </s-stack>
    </s-admin-block>
  );
}
