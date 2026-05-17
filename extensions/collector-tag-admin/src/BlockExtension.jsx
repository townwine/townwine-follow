import React, { useEffect, useMemo, useState } from "react";
import {
  AdminBlock,
  BlockStack,
  Button,
  InlineStack,
  ProgressIndicator,
  Text,
  TextField,
  reactExtension,
  useApi,
} from "@shopify/ui-extensions-react/admin";

const TARGET = "admin.product-details.block.render";

export default reactExtension(TARGET, () => <CollectorTagBlock />);

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

function CollectorTagBlock() {
  const { data } = useApi(TARGET);
  const productId = data.selected?.[0]?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const [savedCollectorTag, setSavedCollectorTag] = useState("");
  const [draftCollectorTag, setDraftCollectorTag] = useState("");
  const [state, setState] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadState() {
      if (!productId) {
        setLoading(false);
        setState(null);
        return;
      }

      setLoading(true);
      setErrorMessage("");
      setStatusMessage("");

      try {
        const response = await fetch(
          `/api/collector-tag?productId=${encodeURIComponent(productId)}`,
        );
        const result = await response.json();

        if (!response.ok || !result?.ok) {
          throw new Error(result?.message || "COLLECTOR_TAG_LOAD_FAILED");
        }

        if (!active) return;

        setState(result.state);
        setSavedCollectorTag(result.state.collectorTag || "");
        setDraftCollectorTag(result.state.collectorTag || "");
        setInputKey((value) => value + 1);
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

  const dirty = draftCollectorTag !== savedCollectorTag;
  const collapsedSummary = useMemo(() => {
    if (state?.hostName) {
      return `${state.hostName} 연결됨`;
    }

    if (savedCollectorTag) {
      return savedCollectorTag;
    }

    return "컬렉터 미설정";
  }, [savedCollectorTag, state]);

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
    <AdminBlock title="컬렉터 태그" collapsedSummary={collapsedSummary}>
      <BlockStack>
        <Text>
          상품 저장 화면 상단에서 컬렉터를 바로 연결하는 입력칸입니다.
          닉네임보다는 공개 핸들을 넣는 것이 가장 정확합니다.
        </Text>

        {loading ? (
          <InlineStack blockAlignment="center">
            <ProgressIndicator size="small-100" />
            <Text>컬렉터 연결 정보를 불러오는 중입니다.</Text>
          </InlineStack>
        ) : (
          <BlockStack>
            <TextField
              key={inputKey}
              label="컬렉터 닉네임 또는 공개 핸들"
              placeholder="예: naeun 또는 @naeun"
              defaultValue={savedCollectorTag}
              onInput={setDraftCollectorTag}
              onChange={setDraftCollectorTag}
            />

            <Text>{buildResolutionSummary(state)}</Text>

            {state?.productStatus ? (
              <Text>현재 상품 상태: {state.productStatus}</Text>
            ) : null}

            {statusMessage ? <Text>{statusMessage}</Text> : null}
            {errorMessage ? <Text>{errorMessage}</Text> : null}

            <InlineStack>
              <Button
                variant="primary"
                disabled={!productId || saving || !dirty}
                onPress={handleSave}
              >
                {saving ? "저장 중..." : "컬렉터 저장"}
              </Button>
              <Button
                variant="secondary"
                disabled={saving || !dirty}
                onPress={handleReset}
              >
                되돌리기
              </Button>
            </InlineStack>
          </BlockStack>
        )}
      </BlockStack>
    </AdminBlock>
  );
}
