#!/usr/bin/env python3
"""Seed the fresh Cloudzy Supabase database with Lovetale starter content.

The script is intentionally stdlib-only so it can run on the Ubuntu VPS without
installing Node or Python packages. It talks to the local Supabase gateway with
the service-role key from .env.cloudzy.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any


SEED_SOURCE = "cloudzy_initial_seed_b"
SEED_NAMESPACE = uuid.UUID("65f7fdf7-6be5-4770-82b1-4b9e9e825001")
DEFAULT_LOCAL_SUPABASE_URL = "http://127.0.0.1:8000"


def load_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def load_env() -> dict[str, str]:
    root = Path(__file__).resolve().parents[2]
    candidates = []
    explicit = os.environ.get("LOVETALE_ENV_FILE")
    if explicit:
        candidates.append(Path(explicit))
    candidates.extend([root / ".env.cloudzy", Path("/opt/lovetale/.env.cloudzy")])

    merged: dict[str, str] = {}
    for path in candidates:
        merged.update(load_env_file(path))
    merged.update({key: value for key, value in os.environ.items() if value})
    return merged


def seed_uuid(*parts: str) -> str:
    return str(uuid.uuid5(SEED_NAMESPACE, ":".join(parts)))


def utc_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def iso_at(days_ago: int) -> str:
    return (utc_now() - dt.timedelta(days=days_ago)).replace(microsecond=0).isoformat()


def request_json(
    base_url: str,
    service_role_key: str,
    path: str,
    *,
    method: str = "GET",
    payload: Any | None = None,
    prefer: str | None = None,
) -> Any:
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
    }
    if body is not None:
        headers["Content-Type"] = "application/json"
    if prefer:
        headers["Prefer"] = prefer

    url = f"{base_url.rstrip('/')}{path}"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=45) as res:
            raw = res.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path} failed with HTTP {exc.code}: {raw}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"{method} {path} failed: {exc.reason}") from exc


def get_author_id(base_url: str, service_role_key: str) -> str:
    override = os.environ.get("SEED_AUTHOR_ID", "").strip()
    if override:
        return override

    admin_roles = request_json(
        base_url,
        service_role_key,
        "/rest/v1/user_roles?select=user_id&role=eq.admin&limit=1",
    )
    if admin_roles:
        return str(admin_roles[0]["user_id"])

    profiles = request_json(
        base_url,
        service_role_key,
        "/rest/v1/profiles?select=id,display_name&order=created_at.asc&limit=1",
    )
    if profiles:
        return str(profiles[0]["id"])

    raise RuntimeError("No profile or admin role exists. Create the initial admin account first.")


def visual_asset(asset_id: str, tier: str, min_affection: int, url: str, caption: str) -> dict[str, Any]:
    return {
        "id": asset_id,
        "tier": tier,
        "minAffection": min_affection,
        "mediaUrl": url,
        "mediaType": "image",
        "caption": caption,
    }


def chapter(slug: str, index: int, title: str, summary: str, body: str, cover_url: str) -> dict[str, Any]:
    return {
        "id": f"ch{index}",
        "title": title,
        "episodeNumber": index,
        "summary": summary,
        "body": body,
        "assetSlots": [
            {
                "id": f"{slug}-chapter-{index}-cover",
                "offset": 0,
                "scene_description": summary,
                "heat_tier": "soft" if index == 1 else "warm",
                "media_url": cover_url,
                "caption": f"{title} 대표 장면",
                "source": "seed",
            }
        ],
    }


def choice(
    label: str,
    next_scene_id: str,
    *,
    result: str,
    route: str,
    image: str,
    affection: int = 1,
    tension: int = 0,
    trust: int = 1,
) -> dict[str, Any]:
    return {
        "label": label,
        "effect": "관계 변화",
        "tone": "선택",
        "result": result,
        "routeHint": route,
        "image": image,
        "nextSceneId": next_scene_id,
        "affectionDelta": affection,
        "tensionDelta": tension,
        "trustDelta": trust,
    }


STORIES: list[dict[str, Any]] = [
    {
        "slug": "secret-contract",
        "title": "비밀 계약: 한 달간의 위장 연인",
        "logline": "차가운 재벌과의 위험한 거래, 그 끝에 남는 진심.",
        "cover": "/seed/char-kaito.jpg",
        "contentType": "story_rpg",
        "max_heat": "spicy",
        "price_credits": 0,
        "tags": ["로맨스", "재벌", "오피스", "금단", "스토리게임"],
        "route": "Contract Route",
        "lead": {
            "id": "char_kaito",
            "name": "카이토",
            "role": "계약 연인",
            "persona": "차갑고 계산적인 재벌 후계자. 계약으로 시작한 관계를 통제하려 하지만, 밤이 깊을수록 진심을 숨기지 못한다.",
            "personality": "절제된 집착, 낮은 목소리, 약속에 약한 사람",
            "relationship": "한 달짜리 위장 연애 계약",
            "speakingStyle": "짧고 낮게 말하며, 중요한 순간에는 상대의 이름을 천천히 부른다.",
            "visualPrompt": "cold heir in a black suit, penthouse night, cinematic romantic tension",
        },
        "partnerLine": "계약서엔 안 적혀 있던 조항이 하나 있어. 오늘 밤은, 진짜처럼 굴어줘.",
        "chapters": [
            (
                "1화 - 계약서 밖의 조항",
                "펜트하우스의 야경 아래, 계약으로 묶인 두 사람이 처음으로 선을 넘는다.",
                "재벌가의 펜트하우스는 지나치게 조용했다. 카이토가 넥타이를 느슨하게 풀자 유리창 너머 도시의 빛이 그의 옆얼굴을 스쳤다. 너는 계약서 마지막 페이지에 적힌 한 달이라는 단어를 떠올렸지만, 그가 건넨 낮은 목소리는 종이 위 조건보다 훨씬 위험했다.",
            ),
            (
                "2화 - 한 달 뒤의 질문",
                "끝나는 날을 먼저 묻는 순간, 위장 연애는 더 이상 안전하지 않다.",
                "카이토는 와인잔을 내려놓고 네 손등 위에 손끝을 얹었다. 차갑던 태도와 달리 손바닥은 뜨거웠다. 한 달 뒤엔 어떻게 되느냐고 묻는 네 말에 그는 잠깐 웃었고, 그 웃음은 처음으로 방어가 무너진 사람의 얼굴처럼 보였다.",
            ),
            (
                "3화 - 계약 위반",
                "거래였던 관계가 진심으로 변하는 밤, 선택은 되돌릴 수 없다.",
                "비가 유리창을 때리기 시작했다. 카이토는 이제 계약서를 보지 않았다. 대신 네 눈을 보며 말했다. 끝나는 날 울지 말라고. 너는 그 말이 부탁인지 협박인지 알 수 없었지만, 이미 대답은 몸이 먼저 알고 있었다.",
            ),
        ],
        "choices": [
            ("그의 손을 잡고 조항의 의미를 묻는다", "scene-observe", 2, 1, 2),
            ("계약서를 접고 지금 진심인지 확인한다", "scene-approach", 3, 2, 1),
            ("한 달 뒤를 먼저 꺼내며 선을 긋는다", "scene-confront", 0, 3, 0),
        ],
    },
    {
        "slug": "midnight-library",
        "title": "한밤의 도서관, 별의 마녀",
        "logline": "잠들지 못한 견습 마녀가 너에게만 보여주는 또 다른 얼굴.",
        "cover": "/seed/char-luna.jpg",
        "contentType": "web_novel",
        "max_heat": "warm",
        "price_credits": 0,
        "tags": ["판타지", "마법", "다정", "로맨스"],
        "route": "Starlight Route",
        "lead": {
            "id": "char_luna",
            "name": "루나",
            "role": "별의 마녀",
            "persona": "금지된 마법서를 지키는 견습 마녀. 장난스럽지만 외로움을 들키면 갑자기 솔직해진다.",
            "personality": "호기심, 다정함, 밤에 강한 집중력",
            "relationship": "한밤의 도서관에서 만난 비밀 동맹",
            "speakingStyle": "속삭이듯 말하고 질문으로 마음을 떠본다.",
            "visualPrompt": "young witch in midnight library, star magic, warm fantasy romance",
        },
        "partnerLine": "쉿. 이 책은 네가 날 믿을 때만 다음 페이지가 열려.",
        "chapters": [
            (
                "1화 - 잠기지 않는 서가",
                "닫힌 도서관에서 루나는 별빛이 새는 책장을 열어 보인다.",
                "자정이 지나자 도서관의 문은 오히려 안쪽에서 열렸다. 루나는 검지로 입술을 가리고 웃었다. 책등마다 박힌 별자리들이 하나씩 빛나기 시작했고, 너에게만 들리는 종소리가 어둠 속에서 번졌다.",
            ),
            (
                "2화 - 금지된 별자리",
                "루나가 숨긴 마법서에는 두 사람의 미래가 아직 적히지 않았다.",
                "루나는 책을 펼치지 못하고 망설였다. 이 별자리를 읽으면 돌이킬 수 없다고 했다. 하지만 그녀의 눈동자는 이미 대답을 기다리고 있었다. 너는 그녀가 무서워하는 것이 마법이 아니라 혼자가 되는 일이라는 걸 알아차렸다.",
            ),
            (
                "3화 - 새벽의 봉인",
                "새벽 전 마지막 주문, 믿음은 가장 위험한 마법이 된다.",
                "책장 사이로 새벽빛이 스며들 때 루나는 네 손을 자기 심장 위에 올렸다. 별들이 잠깐 멈췄다. 주문은 길지 않았다. 다만 서로를 믿겠다는 말 한마디면 충분했다.",
            ),
        ],
        "choices": [
            ("루나의 손등에 뜬 별자리를 읽는다", "scene-observe", 2, 0, 2),
            ("금지된 책을 덮고 그녀의 두려움을 묻는다", "scene-approach", 1, 1, 3),
            ("새벽 전에 봉인을 먼저 깨자고 말한다", "scene-confront", 1, 3, 0),
        ],
    },
    {
        "slug": "rooftop-promise",
        "title": "졸업식 전야, 옥상의 고백",
        "logline": "10년지기 소꿉친구의 첫 밤.",
        "cover": "/seed/char-sakura.jpg",
        "contentType": "web_novel",
        "max_heat": "warm",
        "price_credits": 0,
        "tags": ["청춘", "소꿉친구", "로맨스"],
        "route": "First Love Route",
        "lead": {
            "id": "char_sakura",
            "name": "사쿠라",
            "role": "소꿉친구",
            "persona": "10년 동안 친구로 지낸 사이. 밝고 장난스럽지만 졸업 전날만큼은 마음을 숨기지 않는다.",
            "personality": "수줍음, 솔직함, 오래 참아온 고백",
            "relationship": "친구와 연인 사이의 마지막 경계",
            "speakingStyle": "장난처럼 시작해 갑자기 진심을 말한다.",
            "visualPrompt": "school rooftop dusk, first love, soft romantic atmosphere",
        },
        "partnerLine": "내일이면 졸업이잖아. 오늘은 친구처럼 안 굴어도 돼?",
        "chapters": [
            (
                "1화 - 옥상의 노을",
                "졸업식 전날, 사쿠라는 익숙한 옥상에서 낯선 표정을 보인다.",
                "봄바람이 교복 자락을 흔들었다. 사쿠라는 난간에 기대 네 이름을 불렀다. 10년 동안 수없이 들었던 목소리였는데, 그날만큼은 처음 듣는 고백처럼 떨렸다.",
            ),
            (
                "2화 - 친구라는 말",
                "친구라는 단어가 더 이상 두 사람을 지켜주지 못한다.",
                "사쿠라는 웃으려 했지만 실패했다. 친구로 끝낼 자신이 없다고 말하는 동안, 노을은 그녀의 뺨을 붉게 물들였다. 너는 한 걸음만 다가가면 모든 시간이 달라질 것임을 알았다.",
            ),
            (
                "3화 - 졸업 전야",
                "끝인 줄 알았던 밤이 두 사람의 첫 페이지가 된다.",
                "학교 종이 멀리서 울렸다. 사쿠라는 네 손을 잡고 계단 쪽이 아니라 옥상 한가운데로 걸었다. 내일이면 모두가 헤어지지만, 오늘의 대답만큼은 아무에게도 빼앗기고 싶지 않았다.",
            ),
        ],
        "choices": [
            ("옆에 가까이 서서 노을을 같이 본다", "scene-observe", 2, 0, 2),
            ("친구라는 말을 오늘만 내려놓자고 말한다", "scene-approach", 3, 1, 1),
            ("졸업 후에도 만날 약속을 먼저 꺼낸다", "scene-confront", 1, 2, 2),
        ],
    },
    {
        "slug": "betrayal-knight",
        "title": "반역의 밤, 검은 기사의 도주",
        "logline": "왕국을 등진 그의 손이 너를 잡는다.",
        "cover": "/seed/char-eden.jpg",
        "contentType": "story_rpg",
        "max_heat": "spicy",
        "price_credits": 12,
        "tags": ["판타지", "금단", "기사", "집착", "스토리게임"],
        "route": "Rebellion Route",
        "lead": {
            "id": "char_eden",
            "name": "에덴",
            "role": "검은 기사",
            "persona": "왕국을 등진 기사. 명예보다 너를 선택했고, 그 선택을 후회하지 않으려 한다.",
            "personality": "침착한 집착, 보호 본능, 죄책감",
            "relationship": "도망자와 호위 기사",
            "speakingStyle": "정중하지만 단호하게 명령하듯 말한다.",
            "visualPrompt": "dark knight fleeing a kingdom at night, forbidden fantasy romance",
        },
        "partnerLine": "돌아가고 싶다면 지금 말해. 하지만 난 널 다시 그 궁으로 보내지 않을 거야.",
        "chapters": [
            (
                "1화 - 성문이 닫히는 밤",
                "반역자로 몰린 에덴은 너를 데리고 왕성을 빠져나간다.",
                "성문 뒤에서 경보 종이 울렸다. 에덴은 피 묻은 장갑을 벗지도 못한 채 네 손목을 감쌌다. 충성 서약을 버린 밤, 그의 검은 처음으로 왕이 아니라 너를 위해 뽑혀 있었다.",
            ),
            (
                "2화 - 추격자의 불빛",
                "숲길마다 횃불이 번지고, 그의 집착은 더 노골적으로 드러난다.",
                "비에 젖은 숲에서 에덴은 네가 떨고 있다는 것을 알아차렸다. 그는 망토를 벗어 어깨에 둘러주고 낮게 말했다. 두려워해야 할 건 추격대가 아니라, 이제 너를 놓지 못하는 나일지도 모른다고.",
            ),
            (
                "3화 - 새 왕의 이름",
                "도망의 끝에서 두 사람은 왕국보다 위험한 약속을 선택한다.",
                "새벽의 폐성은 무너져 있었지만 왕좌만은 남아 있었다. 에덴은 그 앞에 무릎을 꿇었다. 왕이 아닌 너에게. 그 장면은 반역보다 더 위험한 맹세처럼 보였다.",
            ),
        ],
        "choices": [
            ("그가 버린 충성의 이유를 묻는다", "scene-observe", 1, 1, 3),
            ("추격대보다 그의 상처를 먼저 살핀다", "scene-approach", 3, 1, 1),
            ("왕성으로 돌아가 진실을 밝히자고 말한다", "scene-confront", 0, 4, 1),
        ],
    },
    {
        "slug": "ceo-after-hours",
        "title": "야근 후, 사장실의 두 번째 얼굴",
        "logline": "엘리베이터가 멈춘 그 밤, 그가 넥타이를 푼다.",
        "cover": "/seed/char-kaito.jpg",
        "contentType": "web_novel",
        "max_heat": "spicy",
        "price_credits": 12,
        "tags": ["오피스", "야근", "금단", "로맨스"],
        "route": "After Hours Route",
        "lead": {
            "id": "char_kaito_office",
            "name": "강태오",
            "role": "대표이사",
            "persona": "회사에서는 완벽한 대표. 야근이 끝난 뒤에는 숨겨둔 사적인 얼굴을 보인다.",
            "personality": "완벽주의, 통제욕, 예상 밖의 다정함",
            "relationship": "대표와 마지막까지 남은 직원",
            "speakingStyle": "공식적인 말투를 유지하다가 둘만 남으면 호칭을 낮춘다.",
            "visualPrompt": "modern CEO office late night, loosened tie, romantic office drama",
        },
        "partnerLine": "퇴근 기록은 내가 지웠어. 이제 남은 건 우리 둘뿐이야.",
        "chapters": [
            (
                "1화 - 마지막 야근",
                "불 꺼진 사무실에서 대표의 시선만 유난히 또렷하다.",
                "모니터 불빛이 하나둘 꺼졌다. 강태오는 보고서를 내려놓고 문을 잠갔다. 늘 완벽하게 각 잡혀 있던 넥타이가 느슨해지는 순간, 사장실은 회사가 아니라 다른 무대가 되었다.",
            ),
            (
                "2화 - 멈춘 엘리베이터",
                "층수 표시가 멈추고, 두 사람 사이의 거리도 멈춘다.",
                "엘리베이터가 흔들린 뒤 멈췄다. 좁은 공간에서 강태오는 네가 괜찮은지 묻다가 말끝을 삼켰다. 너무 가까웠고, 둘 다 그 사실을 모르는 척하기엔 이미 늦었다.",
            ),
            (
                "3화 - 두 번째 얼굴",
                "공식적인 관계가 끝난 자리에서 더 위험한 제안이 시작된다.",
                "비상등 아래 그의 얼굴은 낮보다 솔직했다. 오늘 있었던 일은 잊어도 좋다고 말했지만, 잊히길 바라는 사람의 목소리는 아니었다. 너는 대답 대신 그의 넥타이 끝을 잡았다.",
            ),
        ],
        "choices": [
            ("보고서 대신 그의 진심을 묻는다", "scene-observe", 2, 1, 1),
            ("멈춘 엘리베이터에서 한 발 다가선다", "scene-approach", 3, 2, 1),
            ("내일도 같은 얼굴로 볼 수 있냐고 묻는다", "scene-confront", 0, 3, 2),
        ],
    },
    {
        "slug": "twin-betrayal",
        "title": "친구의 약혼자, 금지된 한 잔",
        "logline": "결혼식 전날 밤의 비밀.",
        "cover": "/seed/char-luna.jpg",
        "contentType": "web_novel",
        "max_heat": "steamy",
        "price_credits": 18,
        "tags": ["금단", "NTR", "약혼자", "성인"],
        "route": "Forbidden Toast Route",
        "lead": {
            "id": "char_luna_forbidden",
            "name": "유리",
            "role": "친구의 약혼자",
            "persona": "결혼식 전날 밤, 마지막으로 진짜 마음을 확인하고 싶어 하는 여자.",
            "personality": "위태로움, 솔직함, 후회 직전의 용기",
            "relationship": "친구의 약혼자와 금지된 대화",
            "speakingStyle": "농담처럼 시작하지만 핵심은 피하지 않는다.",
            "visualPrompt": "wedding eve hotel bar, forbidden romance, intimate cinematic mood",
        },
        "partnerLine": "내일 결혼하는 사람이 이런 말 하면 안 되는 거 아는데... 그래도 오늘은 네가 필요해.",
        "chapters": [
            (
                "1화 - 마지막 잔",
                "결혼식 전날 호텔 바에서 유리는 너에게만 다른 표정을 보인다.",
                "유리는 웨딩드레스 대신 검은 원피스를 입고 있었다. 축하한다고 말하려던 네 입술이 멈췄다. 그녀는 잔을 들어 웃었지만, 손끝은 떨리고 있었다.",
            ),
            (
                "2화 - 말하지 못한 이름",
                "친구의 이름이 대화 사이에 끼어들수록 공기는 더 뜨거워진다.",
                "그녀는 예비 신랑의 이름을 말하다가 네 이름으로 끝냈다. 실수라고 하기엔 너무 정확했고, 고백이라고 하기엔 너무 늦은 말이었다. 둘 사이에 놓인 술잔은 점점 변명처럼 비어 갔다.",
            ),
            (
                "3화 - 새벽의 선택",
                "돌아갈 수 있는 마지막 새벽, 금지된 선택은 이미 시작되었다.",
                "호텔 복도는 조용했다. 유리는 방문 카드키를 손에 쥔 채 너를 돌아보았다. 들어오라는 말은 하지 않았다. 하지만 가지 말라는 눈빛은 누구보다 분명했다.",
            ),
        ],
        "choices": [
            ("오늘 밤만큼은 네 이름을 불러도 되냐고 묻는다", "scene-observe", 2, 2, 0),
            ("내일 후회하지 않을 수 있냐고 확인한다", "scene-approach", 1, 3, 1),
            ("지금 멈추자고 말하며 잔을 내려놓는다", "scene-confront", -1, 2, 3),
        ],
    },
    {
        "slug": "tamed-her-vol1",
        "title": "길들여진 그 밤 · 1권",
        "logline": "눈 떠보니 낯선 천장, 낯선 여자.",
        "cover": "/seed/cover-tamed-her.jpg",
        "avatar": "/seed/char-hayoung.jpg",
        "contentType": "story_rpg",
        "max_heat": "steamy",
        "price_credits": 0,
        "tags": ["성인", "미스터리", "금단", "스토리게임", "멀티엔딩"],
        "route": "Awakening Route",
        "lead": {
            "id": "char_hayoung",
            "name": "하영",
            "role": "낯선 여자",
            "persona": "낯선 방에서 깨어난 주인공을 내려다보는 여자. 모든 걸 아는 듯하지만 쉽게 말하지 않는다.",
            "personality": "나른함, 장난기, 위험한 여유",
            "relationship": "어젯밤의 기억을 쥐고 있는 사람",
            "speakingStyle": "느리게 웃으며 핵심만 흘린다. 상대가 부끄러워할수록 더 차분해진다.",
            "visualPrompt": "mysterious woman in morning bedroom, blue ceiling stars, adult mystery romance",
        },
        "partnerLine": "언제 일어났니? 어젯밤엔 누나라고 잘만 불렀잖아.",
        "chapters": [
            (
                "1화 - 낯선 천장",
                "야광 별이 박힌 푸른 천장 아래, 주인공은 모르는 여자와 함께 눈을 뜬다.",
                "낯선 천장. 짙은 야광색 별 모형들이 흐릿한 시야 위로 떠 있었다. 머리는 깨질 듯 아팠고, 옆자리에서는 낯선 숨소리가 들렸다. 이불 끝을 조심스럽게 들추는 순간, 그녀가 먼저 눈을 떴다.",
            ),
            (
                "2화 - 어젯밤의 이름",
                "하영은 주인공이 기억하지 못하는 밤을 장난처럼 들려준다.",
                "하영은 베개에 기대어 느긋하게 웃었다. 이름을 묻자 그녀는 대답 대신 네 입술을 손끝으로 톡 건드렸다. 어젯밤엔 잘만 불렀잖아. 그 한마디에 네 기억은 더 깊은 안개 속으로 가라앉았다.",
            ),
            (
                "3화 - 진실과 도주",
                "진태와 세희의 이름이 떠오르며, 남을지 도망칠지 선택해야 한다.",
                "휴대폰 화면에는 부재중 전화가 쌓여 있었다. 세희, 진태, 다시 세희. 하영은 부엌에서 커피를 내리며 아무 일도 없었다고 말했다. 하지만 그 말이 진실인지, 너를 붙잡기 위한 가장 위험한 거짓말인지는 아직 알 수 없었다.",
            ),
        ],
        "choices": [
            ("이불을 들춰 옆의 그녀를 확인한다", "scene-observe", 1, 1, 1),
            ("하영에게 어젯밤 무슨 일이 있었는지 묻는다", "scene-approach", 2, 2, 2),
            ("휴대폰을 켜고 부재중 전화부터 확인한다", "scene-confront", 0, 4, 0),
        ],
    },
]


def build_story_row(seed: dict[str, Any], author_id: str, days_ago: int) -> dict[str, Any]:
    story_id = seed_uuid("story", seed["slug"])
    cover_url = seed["cover"]
    avatar_url = seed.get("avatar") or cover_url
    chapters = [
        chapter(seed["slug"], index + 1, title, summary, body, cover_url)
        for index, (title, summary, body) in enumerate(seed["chapters"])
    ]
    body_text = "\n\n".join(item["body"] for item in chapters)
    route = seed["route"]
    lead = seed["lead"]
    choices = [
        choice(
            label,
            next_scene,
            result=f"{lead['name']}의 반응이 달라지고 다음 장면의 공기가 바뀝니다.",
            route=route,
            image=cover_url,
            affection=affection,
            tension=tension,
            trust=trust,
        )
        for label, next_scene, affection, tension, trust in seed["choices"]
    ]

    character = {
        **lead,
        "avatarUrl": avatar_url,
        "tags": seed["tags"][:8],
        "isPrimary": True,
        "chatEnabled": True,
        "visibleInFrontend": True,
        "chatVisible": True,
        "publicVisible": True,
        "reusable": True,
        "llmPurpose": "chat",
        "showcaseAssets": [
            visual_asset(f"{seed['slug']}-soft", "soft", 0, avatar_url, f"{lead['name']} 기본 프로필"),
            visual_asset(f"{seed['slug']}-warm", "warm", 35, cover_url, "관계가 가까워질 때 열리는 이미지"),
            visual_asset(f"{seed['slug']}-spicy", "spicy", 65, cover_url, "호감도가 높을 때 열리는 이미지"),
            visual_asset(f"{seed['slug']}-steamy", "steamy", 85, cover_url, "성인 등급 해금 이미지"),
        ],
    }

    story_rpg: dict[str, Any] = {}
    if seed["contentType"] == "story_rpg":
        story_rpg = {
            "enabled": True,
            "sourceStoryId": story_id,
            "sourceTitle": seed["title"],
            "generatedFrom": SEED_SOURCE,
            "currentRoute": route,
            "startSceneTitle": chapters[0]["title"],
            "startSceneText": chapters[0]["body"],
            "partnerLine": seed["partnerLine"],
            "initialAffection": 18,
            "initialTension": 38,
            "initialTrust": 22,
            "endingsUnlocked": 0,
            "endingsTotal": 5,
            "imagesUnlocked": 1,
            "imagesLocked": 3,
            "routes": [
                {"name": route, "status": "진행 중", "condition": "첫 선택으로 시작", "progress": 0},
                {"name": "Hidden Route", "status": "잠금", "condition": "호감도와 신뢰 조건 필요", "progress": 0},
            ],
            "choices": choices,
            "scenes": [
                {
                    "id": "opening",
                    "title": chapters[0]["title"],
                    "text": chapters[0]["body"],
                    "partnerLine": seed["partnerLine"],
                    "goal": "첫 선택으로 관계의 방향을 정합니다.",
                    "mood": "도입",
                    "choices": choices,
                },
                {
                    "id": "scene-observe",
                    "title": chapters[1]["title"],
                    "text": chapters[1]["body"],
                    "partnerLine": f"{lead['name']}이(가) 잠깐 숨을 고르고 네 대답을 기다립니다.",
                    "goal": "단서를 확인하고 관계의 온도를 조절합니다.",
                    "mood": "관찰",
                    "choices": [],
                },
                {
                    "id": "scene-approach",
                    "title": "감정선이 가까워지는 장면",
                    "text": chapters[1]["body"],
                    "partnerLine": f"{lead['name']}이(가) 낮은 목소리로 조금 더 솔직해져도 된다고 말합니다.",
                    "goal": "상대의 진심을 확인합니다.",
                    "mood": "접근",
                    "choices": [],
                },
                {
                    "id": "scene-confront",
                    "title": chapters[2]["title"],
                    "text": chapters[2]["body"],
                    "partnerLine": f"{lead['name']}의 시선이 흔들리지 않습니다. 정말 그 대답을 듣고 싶어?",
                    "goal": "갈등의 방향을 선택합니다.",
                    "mood": "긴장",
                    "choices": [],
                },
            ],
        }

    beats = []
    for index, item in enumerate(chapters):
        is_last = index == len(chapters) - 1
        beats.append(
            {
                "id": "start" if index == 0 else f"beat-{index + 1}",
                "speaker": lead["name"],
                "text": seed["partnerLine"] if index == 0 else item["summary"],
                "narration": item["body"],
                "emotion": "tense" if index == 0 else "passion",
                "choices": [] if is_last else [{"label": "다음 장면으로", "next": f"beat-{index + 2}", "affection": 1}],
                "end": is_last,
            }
        )

    asset_slots = [
        {
            "id": f"{seed['slug']}-slot-{index + 1}",
            "offset": 0,
            "scene_description": item["summary"],
            "heat_tier": "soft" if index == 0 else "warm",
            "media_url": cover_url,
            "caption": item["title"],
            "source": "seed",
        }
        for index, item in enumerate(chapters)
    ]

    character_card = {
        "contentType": seed["contentType"],
        "sourceStoryId": story_id,
        "storyOverview": seed["logline"],
        "chapters": chapters,
        "characters": [character],
        "name": lead["name"],
        "role": lead["role"],
        "persona": lead["persona"],
        "notes": lead["persona"],
        "personality": lead["personality"],
        "relationship": lead["relationship"],
        "speakingStyle": lead["speakingStyle"],
        "visualPrompt": lead["visualPrompt"],
        "appearance": lead["visualPrompt"],
        "avatarUrl": avatar_url,
        "storyRpg": story_rpg,
    }

    created_at = iso_at(days_ago)
    return {
        "id": story_id,
        "user_id": author_id,
        "title": seed["title"],
        "logline": seed["logline"],
        "source_prompt": SEED_SOURCE,
        "character_card": character_card,
        "beats": beats,
        "cover_url": cover_url,
        "status": "published",
        "is_public": True,
        "is_listed": True,
        "price_credits": seed["price_credits"],
        "model": "seed",
        "created_at": created_at,
        "updated_at": created_at,
        "audience": "all",
        "max_heat": seed["max_heat"],
        "tags": seed["tags"],
        "body_text": body_text,
        "asset_slots": asset_slots,
        "compose_step": "published",
    }


def placement(slot: str, story_id: str, sort_order: int, author_id: str) -> dict[str, Any]:
    return {
        "id": seed_uuid("placement", slot, story_id),
        "slot": slot,
        "story_id": story_id,
        "sort_order": sort_order,
        "is_active": True,
        "created_by": author_id,
    }


def main() -> int:
    env = load_env()
    service_role_key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not service_role_key:
        print("Missing SUPABASE_SERVICE_ROLE_KEY in .env.cloudzy or environment.", file=sys.stderr)
        return 1

    base_url = os.environ.get("SUPABASE_SEED_URL") or DEFAULT_LOCAL_SUPABASE_URL
    author_id = get_author_id(base_url, service_role_key)
    rows = [build_story_row(story, author_id, index) for index, story in enumerate(STORIES)]

    request_json(
        base_url,
        service_role_key,
        "/rest/v1/user_stories?on_conflict=id",
        method="POST",
        payload=rows,
        prefer="resolution=merge-duplicates,return=representation",
    )

    by_slug = {story["slug"]: seed_uuid("story", story["slug"]) for story in STORIES}
    placements = [
        placement("hero", by_slug["secret-contract"], 0, author_id),
        placement("hero", by_slug["tamed-her-vol1"], 1, author_id),
        placement("trending", by_slug["tamed-her-vol1"], 0, author_id),
        placement("trending", by_slug["secret-contract"], 1, author_id),
        placement("trending", by_slug["midnight-library"], 2, author_id),
        placement("trending", by_slug["rooftop-promise"], 3, author_id),
        placement("new", by_slug["twin-betrayal"], 0, author_id),
        placement("new", by_slug["ceo-after-hours"], 1, author_id),
        placement("new", by_slug["betrayal-knight"], 2, author_id),
    ]
    request_json(
        base_url,
        service_role_key,
        "/rest/v1/home_placements?on_conflict=slot,story_id",
        method="POST",
        payload=placements,
        prefer="resolution=merge-duplicates,return=representation",
    )

    seeded = request_json(
        base_url,
        service_role_key,
        f"/rest/v1/user_stories?select=id,title&source_prompt=eq.{SEED_SOURCE}&order=created_at.desc",
    )
    placed = request_json(
        base_url,
        service_role_key,
        "/rest/v1/home_placements?select=id,slot,story_id&is_active=eq.true",
    )
    print(f"Seeded {len(seeded or [])} Lovetale stories for author {author_id}.")
    print(f"Active home placements: {len(placed or [])}.")
    for story in seeded or []:
        print(f"- {story['title']} ({story['id']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
