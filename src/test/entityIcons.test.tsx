import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { HeroIcon, ItemIcon, PlayerAvatar } from "../components/media/EntityIcons";
import { heroImageUrl, itemImageUrl } from "../lib/imageUrls";

afterEach(cleanup);

describe("построение URL изображений", () => {
  it("heroImageUrl: npc_dota_hero_* → официальный CDN Valve", () => {
    expect(heroImageUrl("npc_dota_hero_antimage")).toBe(
      "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/antimage.png",
    );
    expect(heroImageUrl("npc_dota_hero_furion")).toContain("/heroes/furion.png");
  });

  it("heroImageUrl: пустое или подозрительное значение → null", () => {
    expect(heroImageUrl(undefined)).toBeNull();
    expect(heroImageUrl("")).toBeNull();
    expect(heroImageUrl("npc_dota_hero_x; DROP")).toBeNull();
  });

  it("itemImageUrl: путь img из constants → абсолютный URL CDN", () => {
    expect(itemImageUrl("/apps/dota2/images/dota_react/items/blink.png?t=1")).toBe(
      "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/blink.png",
    );
    expect(itemImageUrl("https://example.com/i.png?x=1")).toBe("https://example.com/i.png");
    expect(itemImageUrl(undefined)).toBeNull();
  });
});

describe("Fallback изображений", () => {
  it("HeroIcon без внутреннего имени показывает локальный плейсхолдер, а не сломанный значок", () => {
    render(<HeroIcon className="h-8 w-8" />);
    const img = screen.getByRole("img", { name: /иконка героя/i });
    expect(img).toBeInTheDocument();
    // Vite инлайнит локальный SVG в data-URI — главное, что не внешний CDN.
    expect(img.getAttribute("src")).toMatch(/^(data:image\/svg|.*placeholder)/);
  });

  it("ошибка CDN переключает на локальный плейсхолдер", () => {
    render(
      <HeroIcon
        heroName="npc_dota_hero_antimage"
        displayName="Anti-Mage"
        className="h-8 w-8"
      />,
    );
    const img = screen.getByAltText(/Герой Anti-Mage/) as HTMLImageElement;
    expect(img.src).toContain("cdn.cloudflare.steamstatic.com");
    fireEvent.error(img);
    const fallback = screen.getByAltText(/Герой Anti-Mage/) as HTMLImageElement;
    expect(fallback.getAttribute("src")).toMatch(/^(data:image\/svg|.*placeholder)/);
    expect(fallback.src).not.toContain("cdn.cloudflare.steamstatic.com");
  });

  it("повторная ошибка (сломался и плейсхолдер) не создаёт цикл — остаётся статичный значок", () => {
    render(
      <HeroIcon
        heroName="npc_dota_hero_antimage"
        displayName="Anti-Mage"
        className="h-8 w-8"
      />,
    );
    fireEvent.error(screen.getByAltText(/Герой Anti-Mage/));
    const fallback = screen.getByAltText(/Герой Anti-Mage/);
    fireEvent.error(fallback);
    // Второй раз src не меняется: остаётся один статичный значок без запросов.
    expect(screen.getAllByRole("img").length).toBe(1);
    expect(screen.getByLabelText(/Герой Anti-Mage/i)).toBeInTheDocument();
  });

  it("ItemIcon без данных показывает локальную заглушку с подписью", () => {
    render(<ItemIcon className="h-8 w-8" />);
    expect(screen.getByRole("img", { name: /иконка предмета/i })).toBeInTheDocument();
  });

  it("PlayerAvatar без аватара — локальная заглушка", () => {
    render(<PlayerAvatar name="Tester" className="h-10 w-10" />);
    const img = screen.getByRole("img", { name: /Аватар игрока Tester/i });
    expect(img.getAttribute("src")).toMatch(/^(data:image\/svg|.*placeholder)/);
  });

  it("все изображения имеют alt и loading=lazy для не срочных", () => {
    render(
      <>
        <HeroIcon heroName="npc_dota_hero_antimage" displayName="Anti-Mage" />
        <ItemIcon img="/apps/dota2/images/dota_react/items/blink.png" displayName="Blink Dagger" />
      </>,
    );
    expect(screen.getByAltText("Герой Anti-Mage").getAttribute("loading")).toBe("lazy");
    expect(screen.getByAltText("Предмет Blink Dagger").getAttribute("loading")).toBe("lazy");
  });
});
