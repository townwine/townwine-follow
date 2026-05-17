import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import {
  ensureCollectorMetaobjectDefinition,
  listCollectorProfiles,
} from "../services/collector-profiles.server";
import { ensureProductMetafieldDefinitions } from "../services/product-metafield-definitions.server";
import {
  getUpcomingDealAdminSnapshots,
  processDueOpenAlerts,
} from "../services/open-alert.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  try {
    const [result, collectorDefinitionResult, collectorProfiles, upcomingDeals, processedAlerts] =
      await Promise.all([
      ensureProductMetafieldDefinitions(admin),
      ensureCollectorMetaobjectDefinition(admin),
      listCollectorProfiles(admin),
      getUpcomingDealAdminSnapshots({
        admin,
        shop: session.shop,
        limit: 12,
      }),
      processDueOpenAlerts({
        admin,
        shop: session.shop,
      }),
    ]);

    return {
      metafieldsReady: true,
      collectorDefinitionReady: true,
      collectorDefinitionResult,
      collectorProfileCount: collectorProfiles.length,
      upcomingDeals,
      processedAlerts,
      ...result,
    };
  } catch (error) {
    console.error("[custom-data] failed to ensure product metafield definitions", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      metafieldsReady: false,
      collectorDefinitionReady: false,
      collectorDefinitionResult: {
        created: false,
        updated: false,
      },
      collectorProfileCount: 0,
      createdKeys: [],
      updatedKeys: [],
      totalDefinitions: 0,
      upcomingDeals: [],
      processedAlerts: {
        ok: false,
        processedProductCount: 0,
        sentCount: 0,
        cleanedCount: 0,
      },
    };
  }
};

export default function Index() {
  const data = useLoaderData<typeof loader>();

  return (
    <s-page heading="TownWine Follow">
      <s-section heading="앱 연결 완료">
        <s-paragraph>
          개발 스토어와 앱 서버 연결은 정상입니다. 이 앱은 홈 인플루언서
          팔로우, App Proxy, 상품 업데이트 webhook 테스트용으로 사용됩니다.
        </s-paragraph>
      </s-section>
      <s-section heading="현재 준비된 기능">
        <s-unordered-list>
          <s-list-item>스토어프론트 App Proxy follow / unfollow / status</s-list-item>
          <s-list-item>상품 상세 커스텀 메타필드 자동 보장</s-list-item>
          <s-list-item>상품 예약 오픈 월/일/시/분 입력 및 실제 오픈 일시 자동 계산</s-list-item>
          <s-list-item>예정 공구 오픈 알림 신청 및 고객별 메일 발송</s-list-item>
          <s-list-item>실고객 기반 컬렉터 메타오브젝트 등록 / 수정</s-list-item>
          <s-list-item>상품 update webhook 수신</s-list-item>
          <s-list-item>인플루언서 handle 기준 팔로워 매칭</s-list-item>
        </s-unordered-list>
      </s-section>
      <s-section heading="컬렉터 프로필">
        <s-paragraph>
          {data.collectorDefinitionReady
            ? `collector_profile 정의 연결 완료 · 등록된 컬렉터 ${data.collectorProfileCount}명`
            : "컬렉터 메타오브젝트 정의를 아직 확인하지 못했습니다."}
        </s-paragraph>
        <s-paragraph>
          앱 상단의 `Collectors` 탭에서 실제 가입 고객을 선택해 컬렉터
          프로필을 등록할 수 있습니다.
        </s-paragraph>
      </s-section>
      <s-section heading="상품 어드민 입력 필드">
        <s-paragraph>
          {data.metafieldsReady
            ? `상품 관리자에서 편집 가능한 메타필드 ${data.totalDefinitions}개를 확인했습니다.`
            : "메타필드 정의 보장 중 오류가 있어 재시도가 필요합니다."}
        </s-paragraph>
        {data.metafieldsReady ? (
          <s-paragraph>
            생성 {data.createdKeys.length}개, 업데이트 {data.updatedKeys.length}개
          </s-paragraph>
        ) : null}
      </s-section>
      <s-section heading="예정 공구 연동 현황">
        <s-paragraph>
          예약 오픈 상품 {data.upcomingDeals.length}개가 앱과 연동되어 있습니다.
        </s-paragraph>
        <s-paragraph>
          이번 로드에서 처리한 오픈 알림 메일 {data.processedAlerts.sentCount}건
        </s-paragraph>
        {data.upcomingDeals.length ? (
          <s-unordered-list>
            {data.upcomingDeals.map((deal) => (
              <s-list-item key={deal.productId}>
                {deal.title} · {deal.openAtKst} · 알림 {deal.subscriberCount}명
              </s-list-item>
            ))}
          </s-unordered-list>
        ) : (
          <s-paragraph>
            상품 메타필드에 공구 오픈 월/일/시/분을 입력한 상품이 아직 없습니다.
          </s-paragraph>
        )}
      </s-section>
      <s-section heading="다음 단계">
        <s-paragraph>
          예약 상품 오픈 시점에 맞춘 고객 알림까지 자동화하려면 별도 스케줄러나
          워커를 붙이는 것이 가장 안전합니다.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
