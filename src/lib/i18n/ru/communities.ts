import type { Dict } from "../en";

export const communities: Dict["communities"] = {
    metaTitle: "Сообщества",
    metaDescription:
        "Сообщества на MyBLHub: находите тех, кто смотрит то же самое и ходит на те же события.",
    heading: "Сообщества",
    eyebrow: "Вместе",
    intro: "Место, где находят своих — тех, кто смотрит то же самое.",

    create: "Создать сообщество",
    createTitle: "Новое сообщество",
    titleLabel: "Название",
    titlePlaceholder: "Лакорны Беларусь",
    descriptionLabel: "О сообществе",
    descriptionPlaceholder: "Для кого оно и что внутри происходит.",

    visibilityLabel: "Кто может найти",
    visibility: {
        PUBLIC: "Все",
        PRIVATE: "Только по ссылке",
    },
    visibilityHint: {
        PUBLIC: "Витрину видят все, включая поисковики. То, что внутри, остаётся участникам.",
        PRIVATE: "Ни в списке, ни в поиске: страница открывается по прямой ссылке, а внутрь пускает только участие.",
    },

    joinModeLabel: "Вступление",
    joinMode: {
        OPEN: "Свободное",
        APPROVAL: "С одобрения создателя",
    },

    members: "Участники",
    membersCount: (n: number) => `${n} участников`,
    requests: "Заявки на вступление",
    join: "Вступить",
    joinRequest: "Подать заявку",
    pending: "Заявка на рассмотрении",
    leave: "Покинуть сообщество",
    leaveConfirm: "Выйти из сообщества?",
    accept: "Принять",
    decline: "Отклонить",
    remove: "Убрать",
    removeConfirm: "Убрать человека из сообщества?",
    owner: "Создатель",
    moderator: "Модератор",

    linksTitle: "Ссылки",
    linkLabel: "Подпись",
    linkUrl: "Ссылка",
    addLink: "Добавить ссылку",
    deleteLink: "Убрать ссылку",

    edit: "Изменить",
    save: "Сохранить",
    delete: "Удалить сообщество",
    deleteConfirm: "Удалить сообщество? Участники и ссылки пропадут насовсем.",

    insideLockedTitle: "Внутри — для участников",
    insideLockedHint:
        "Участники, ссылки и встречи видны после вступления: за встречами стоят адреса, за ссылками — закрытые чаты.",
    privateTitle: "Это закрытое сообщество",
    privateHint: "Попасть внутрь можно по приглашению создателя.",

    emptyTitle: "Сообществ пока нет",
    emptyHint: "Первое — за вами.",
    emptyMine: "Вы пока ни в одном сообществе.",
    myCommunities: "Мои",
    allCommunities: "Все",

    errors: {
        premium: "Создание сообществ — часть подписки.",
        titleRequired: "У сообщества должно быть название",
        limit: (n: number) => `Больше ${n} сообществ вести не получится`,
        notFound: "Сообщество не найдено",
        noRequest: "Такой заявки больше нет",
        ownerLeave: "Создатель не может выйти из своего сообщества — его можно только удалить",
        linkRequired: "У ссылки нужны подпись и адрес",
        linkUrl: "Ссылка должна начинаться с http:// или https://",
    },
};
